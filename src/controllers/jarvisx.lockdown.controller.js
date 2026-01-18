const Service = require("../models/Service");
const PaymentMethod = require("../models/PaymentMethod");
const WorkPosition = require("../models/WorkPosition");
const SiteSettings = require("../models/SiteSettings");
const ServiceRequest = require("../models/ServiceRequest");
const Order = require("../models/Order");
const mongoose = require("mongoose");

const sessionManager = require("../utils/sessionManager");
const {
  classifyIntent,
  classifyIntentDetailed,
  getIntentResponse,
} = require("../utils/intentClassifier");
const {
  groqChatCompletion,
  buildJarvisxPublicSystemPrompt,
} = require("../services/jarvisxProviders");
const {
  getQuickReplyRoute,
  applyRouteToSession,
  getStepResponse,
  hasActiveFlow,
  isPureGreeting,
  advanceFlow,
} = require("../utils/jarvisStateMachine");

function clampString(value, maxLen) {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!v) return "";
  if (typeof maxLen !== "number" || maxLen <= 0) return v;
  return v.length <= maxLen ? v : v.slice(0, maxLen);
}

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function ensureUniqueServiceSlug(baseSlug) {
  let candidate = baseSlug;
  let suffix = 1;
  while (await Service.exists({ slug: candidate })) {
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }
  return candidate;
}

function parsePriceFromText(text) {
  const match = String(text || "").match(
    /\$\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(usd|dollars?)\b/i,
  );
  if (!match) return null;
  const value = Number(match[1] || match[2]);
  return Number.isFinite(value) ? value : null;
}

function extractMongoId(text) {
  const match = String(text || "").match(/\b[0-9a-f]{24}\b/i);
  return match ? match[0] : null;
}

function isAdminUser(req) {
  return req.user?.role === "admin";
}

function scrubAdminUnsafePhrases(text) {
  const raw = String(text || "").trim();
  if (!raw) return raw;

  const lower = raw.toLowerCase();

  // Never allow LLM disclaimers / credential fishing in admin UI.
  if (lower.includes("large language model") || lower.includes("as an ai")) {
    return "I can help with UREMO admin status and actions. Tell me what to check or change.";
  }

  // If the model asks for secrets/credentials, replace with a safe guidance.
  if (
    /(password|api key|secret key|jwt secret|access token|refresh token|credentials)/i.test(
      raw,
    )
  ) {
    return "For security, I can’t request or process credentials here. Use the Admin panel or environment variables already configured.";
  }

  return raw;
}

function getGroqStatus() {
  const apiKey = String(process.env.GROQ_API_KEY || "").trim();
  const model =
    String(process.env.JARVISX_MODEL || "llama-3.3-70b-versatile")
      .trim()
      .toLowerCase() || "llama-3.3-70b-versatile";

  return {
    configured: !!apiKey,
    provider: "groq",
    model,
  };
}

function setJarvisxSidCookieIfNeeded(req, res) {
  if (!req?._jarvisxNewSid) return;

  // IMPORTANT: cross-site cookies require SameSite=None;Secure.
  // If frontend proxies requests through the same site, Lax is fine.
  let sameSite = "lax";
  let secure = process.env.NODE_ENV === "production";

  try {
    const origin = String(req.headers?.origin || "").trim();
    const host = String(req.headers?.host || "").trim();
    if (origin) {
      const originHost = new URL(origin).host;
      if (originHost && host && originHost !== host) {
        sameSite = "none";
        secure = true;
      }
    }
  } catch {
    // ignore; keep defaults
  }

  res.cookie("jarvisx_sid", req._jarvisxNewSid, {
    httpOnly: true,
    sameSite,
    secure,
    maxAge: 30 * 60 * 1000,
    path: "/",
  });
}

function isDbConnected() {
  try {
    return mongoose?.connection?.readyState === 1;
  } catch {
    return false;
  }
}

// PATCH_08: Monitoring endpoint. Must never crash.
exports.health = async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const llm = getGroqStatus();
    return res.status(200).json({
      ok: true,
      service: "jarvisx",
      groq: {
        keyPresent: !!llm.configured,
        model: llm.model,
        provider: llm.provider,
      },
      database: { connected: isDbConnected() },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[JARVISX_HEALTH_FAIL] errMessage=${err?.message}`);
    return res.status(200).json({
      ok: true,
      service: "jarvisx",
      groq: {
        keyPresent: !!String(process.env.GROQ_API_KEY || "").trim(),
        model: String(process.env.JARVISX_MODEL || "llama-3.3-70b-versatile")
          .trim()
          .toLowerCase(),
        provider: "groq",
      },
      database: { connected: false },
      timestamp: new Date().toISOString(),
    });
  }
};

// PATCH_10: Always-JSON ping endpoint.
exports.ping = async (_req, res) => {
  res.set("Cache-Control", "no-store");
  return res.status(200).json({ ok: true, message: "pong", at: Date.now() });
};

exports.llmStatus = async (req, res) => {
  const model = String(process.env.JARVISX_MODEL || "llama-3.3-70b-versatile")
    .trim()
    .toLowerCase();

  res.set("Cache-Control", "no-store");

  const apiKey = String(process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) {
    return res.json({
      configured: false,
      provider: "groq",
      model: model || "llama-3.3-70b-versatile",
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const completion = await groqChatCompletion(
      [
        {
          role: "user",
          content: "Reply with the single word 'ok'. Do not add punctuation.",
        },
      ],
      { temperature: 0, max_tokens: 5, model },
    );

    const text = String(completion?.choices?.[0]?.message?.content || "")
      .trim()
      .toLowerCase();

    return res.json({
      configured: text === "ok" || text.length > 0,
      provider: "groq",
      model: model || "llama-3.3-70b-versatile",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[JARVISX_LLM_DOWN] errMessage=${err?.message}`);
    return res.json({
      configured: false,
      provider: "groq",
      model: model || "llama-3.3-70b-versatile",
      timestamp: new Date().toISOString(),
    });
  }
};

async function getPublicContextObject() {
  const [settings, services, paymentMethods, workPositions] = await Promise.all(
    [
      SiteSettings.findOne({}).lean(),
      Service.find({ active: true }).sort({ createdAt: -1 }).limit(50).lean(),
      PaymentMethod.find({ active: true })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      WorkPosition.find({ active: true })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
    ],
  );

  return {
    settings: settings || null,
    services: Array.isArray(services) ? services : [],
    paymentMethods: Array.isArray(paymentMethods) ? paymentMethods : [],
    workPositions: Array.isArray(workPositions) ? workPositions : [],
    rules: {
      provider: "groq",
      ttlMinutes: 30,
    },
  };
}

async function getAdminContextObject() {
  const [settings, servicesCount, paymentMethodsCount, workPositionsCount] =
    await Promise.all([
      SiteSettings.findOne({}).lean(),
      Service.countDocuments({}),
      PaymentMethod.countDocuments({}),
      WorkPosition.countDocuments({}),
    ]);

  return {
    settings: settings || null,
    counts: {
      services: servicesCount,
      paymentMethods: paymentMethodsCount,
      workPositions: workPositionsCount,
    },
    llm: getGroqStatus(),
    serverTime: new Date().toISOString(),
  };
}

function brainV1IsGreeting(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase();
  return /^(hi|hello|hey|yo|sup)(\b|$)/.test(t);
}

// PATCH_07 helpers (strict menu + identity)
function isExplicitMenuRequest(text) {
  const t = String(text || "").toLowerCase();
  return (
    t.includes("what can you do") ||
    t.includes("options") ||
    t.includes("menu") ||
    t.includes("help menu") ||
    t.includes("commands")
  );
}

function isGreetingOnly(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase();
  return ["hi", "hello", "hey", "start", "yo"].includes(t);
}

function isIdentityQuestion(text) {
  const t = String(text || "").toLowerCase();
  return (
    t.includes("your name") ||
    t.includes("who are you") ||
    t.includes("what are you") ||
    t.includes("jarvis")
  );
}

function buildAssistantIdentityReply() {
  return "I’m JarvisX, UREMO’s Support assistant ✅ I can help with services, orders, and support.";
}

function buildUserIdentityReply(req) {
  const user = req?.user || null;
  const name = String(user?.name || user?.fullName || "").trim();
  const email = String(user?.email || "").trim();
  const id = String(user?.id || user?._id || "").trim();

  // Optional-auth token payloads often only include id.
  if (email || name) {
    const parts = [name || null, email ? `<${email}>` : null].filter(Boolean);
    return `You’re logged in ✅ ${parts.join(" ")}`;
  }

  if (id) {
    return "You look logged in ✅ (I can only see limited identity details from your token).";
  }

  return "I can’t identify you unless you’re logged in. If you log in, I can show basic account info.";
}

function escapeRegex(str) {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePlatform(p) {
  const v = String(p || "")
    .trim()
    .toLowerCase();
  return v || "";
}

function buildPublicMenuReply(session) {
  const hasFlow = !!(session?.flow && hasActiveFlow(session));
  return {
    reply: "I can help with services, orders, or support. What do you need?",
    quickReplies: hasFlow
      ? ["Continue", "Buy service", "Order status", "Interview help"]
      : ["Buy service", "Order status", "Interview help"],
  };
}

function brainV1RephraseQuestion(questionKey) {
  const rephraseMap = {
    platform: "Let me clarify - which platform or company is this for?",
    service_selection: "Which specific service are you looking for?",
    order_identifier: "What's your order ID or the email used for purchase?",
    service_name: "What should we call this service?",
    payment_proof:
      "Please share your payment screenshot and the email you used.",
  };
  return rephraseMap[questionKey] || "Can you clarify what you need?";
}

function brainV1GetNextStep(session, intent) {
  const collectedData = session?.collectedData || {};

  if (intent === "INTERVIEW_HELP" && collectedData.platform) {
    return {
      reply: `Got it (${collectedData.platform}). Please describe what you need help with.`,
      quickReplies: [
        "Practice questions",
        "Video test prep",
        "Screening answers",
      ],
    };
  }

  if (intent === "BUY_SERVICE") {
    return {
      reply:
        "We have KYC help, onboarding, interview support. Which one do you want?",
      quickReplies: ["KYC help", "Onboarding", "Interview support"],
    };
  }

  return {
    reply: "Please continue with your request.",
    quickReplies: [],
  };
}

async function brainV1GenerateAdminResponse(message, intent, session) {
  const prompt = `You are JarvisX, the AI twin for UREMO admin.\nCurrent intent: ${intent}\nSession context: ${JSON.stringify(
    session?.collectedData || {},
  )}\nUser message: ${message}\n\nRespond as the admin's assistant. Be concise, helpful, and action-oriented.\nNEVER say \"contact admin\" or \"I'm not sure\".\nFormat: \"Yes boss ✅ [action/response]\"`;

  try {
    const completion = await groqChatCompletion(
      [{ role: "user", content: prompt }],
      { temperature: 0.3, max_tokens: 150 },
    );

    const text = completion?.choices?.[0]?.message?.content;
    const out = typeof text === "string" ? text.trim() : "";
    if (out) return out;
  } catch {
    // fall back to deterministic template
  }

  const intentInfo = getIntentResponse(intent, true);
  return intentInfo.admin;
}

exports.getPublicContext = async (req, res) => {
  try {
    const out = await getPublicContextObject();
    res.set("Cache-Control", "no-store");
    return res.json(out);
  } catch (err) {
    console.error(`[JARVISX_PUBLIC_CONTEXT_FAIL] errMessage=${err?.message}`);
    return res.status(500).json({ message: "Unable to load JarvisX context" });
  }
};

exports.getAdminContext = async (req, res) => {
  try {
    const out = await getAdminContextObject();
    res.set("Cache-Control", "no-store");
    return res.json(out);
  } catch (err) {
    console.error(`[JARVISX_ADMIN_CONTEXT_FAIL] errMessage=${err?.message}`);
    return res.status(500).json({ message: "Unable to load JarvisX context" });
  }
};

exports.chat = async (req, res) => {
  const startTime = Date.now();
  const message = clampString(req.body?.message, 1200);

  if (!message) {
    return res.status(400).json({ message: "Message is required" });
  }

  const mode = String(req.body?.mode || "public")
    .trim()
    .toLowerCase();
  const wantsAdmin = mode === "admin" || req.body?.isAdmin === true;
  const isAdmin = isAdminUser(req);

  if (wantsAdmin) {
    if (!req.user?.id && !req.user?._id) {
      return res.status(200).json({
        ok: false,
        reply: "Admin mode requires admin login. Please login as admin again.",
        intent: "AUTH_REQUIRED",
        quickReplies: ["Re-login"],
      });
    }
    if (!isAdmin) {
      return res.status(200).json({
        ok: false,
        reply: "Admin mode requires admin login. Please login as admin again.",
        intent: "ADMIN_REQUIRED",
        quickReplies: ["Re-login"],
      });
    }
  }

  try {
    const session = await sessionManager.getOrCreateSession(
      req,
      wantsAdmin ? "admin" : "public",
    );
    session.collectedData = session.collectedData || {};

    // Ensure stable session cookie is set (anonymous users).
    setJarvisxSidCookieIfNeeded(req, res);

    const hasHistory =
      Array.isArray(session.conversation) && session.conversation.length > 0;

    // =============================
    // ADMIN MODE — ALWAYS CALL GROQ
    // =============================
    if (wantsAdmin) {
      // PATCH_10: Capture explicit admin identity details from messages (no hallucination).
      // This enables persistence even when JWT doesn't include email/name.
      try {
        const lower = String(message || "").toLowerCase();
        const emailMatch = lower.match(
          /\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i,
        );
        const nameMatch = String(message || "").match(
          /\bmy\s+name\s+is\s+([a-z][a-z\s'.-]{1,40})\b/i,
        );

        if (!session.metadata || typeof session.metadata !== "object") {
          session.metadata = {};
        }
        if (!session.metadata.adminIdentity) {
          session.metadata.adminIdentity = {};
        }

        if (emailMatch?.[1]) {
          session.metadata.adminIdentity.email = String(emailMatch[1]).trim();
        }
        if (nameMatch?.[1]) {
          session.metadata.adminIdentity.name = String(nameMatch[1]).trim();
        }

        if (typeof session.save === "function") {
          await session.save();
        }
      } catch {
        // ignore
      }

      // PATCH_10: Admin identity queries must be answered from metadata only.
      const normalized = String(message || "")
        .toLowerCase()
        .trim();
      const isIdentityQuery =
        normalized.includes("who am i") ||
        normalized.includes("what's my name") ||
        normalized.includes("what is my name") ||
        normalized.includes("so what's my name") ||
        normalized.includes("so whats my name") ||
        normalized.includes("whats my name") ||
        normalized.includes("tell me my name") ||
        normalized.includes("my email") ||
        normalized.includes("do you remember me") ||
        normalized.includes("do you recognize me") ||
        normalized.includes("identify me") ||
        (normalized.includes("my name") && normalized.includes("what"));

      if (isIdentityQuery) {
        const adminIdentity = sessionManager.getAdminIdentity(session);
        if (adminIdentity) {
          const name = String(adminIdentity.name || "Admin").trim() || "Admin";
          const email = String(adminIdentity.email || "").trim();
          const role = String(adminIdentity.role || "admin").trim() || "admin";
          const out = email
            ? `You are ${name} (${email}) — ${role} of UREMO.`
            : `You are ${name} — ${role} of UREMO.`;

          await sessionManager.addMessage(session, "user", message);
          await sessionManager.addMessage(session, "jarvis", out);
          return res.json({
            ok: true,
            reply: out,
            intent: "ADMIN_IDENTITY",
            quickReplies: ["System health", "Orders", "Create service"],
            sessionId: session.sessionKey,
          });
        }

        const out =
          "I can't see your admin identity because auth/session isn't attached. Please login again.";
        await sessionManager.addMessage(session, "user", message);
        await sessionManager.addMessage(session, "jarvis", out);
        return res.json({
          ok: true,
          reply: out,
          intent: "ADMIN_IDENTITY",
          quickReplies: ["Re-login", "Try again"],
          sessionId: session.sessionKey,
        });
      }

      // PATCH_11: Admin actions MUST be real (DB write) — never claim success otherwise.
      // We handle common service actions here to keep admin LLM honest.
      // PATCH_13: Extended to include delete and list services for admin
      {
        const lower = String(message || "").toLowerCase();
        const wantsEditService =
          /^(edit|update)\b/.test(lower) ||
          /\b(change|modify)\s+service\b/.test(lower);
        const wantsCreateService = /(create|add|new)\s+(a\s+)?service\b/.test(
          lower,
        );
        const wantsActivateService =
          /(activate|publish)\s+(a\s+)?service\b/.test(lower);
        const wantsDeleteService = /(delete|remove)\s+(a\s+)?service\b/.test(
          lower,
        );
        const wantsListServices =
          /(list|show|view)\s+(all\s+)?services?\b/.test(lower);
        const targetServiceId = extractMongoId(message);

        // PATCH_13: List services for admin
        if (wantsListServices) {
          try {
            const services = await Service.find({})
              .sort({ createdAt: -1 })
              .limit(20)
              .lean();

            if (!services.length) {
              const reply = "No services found in the database.";
              await sessionManager.addMessage(session, "user", message);
              await sessionManager.addMessage(session, "jarvis", reply);
              return res.json({
                ok: true,
                reply,
                intent: "ADMIN_SERVICE_LIST",
                quickReplies: ["Create service"],
                sessionId: session.sessionKey,
              });
            }

            const lines = services.map(
              (s) =>
                `• ${s.title} - $${s.price} (${s.active ? "active" : "inactive"}) [${s._id}]`,
            );
            const reply = `Services (${services.length}):\n${lines.join("\n")}`;
            await sessionManager.addMessage(session, "user", message);
            await sessionManager.addMessage(session, "jarvis", reply);
            return res.json({
              ok: true,
              reply,
              intent: "ADMIN_SERVICE_LIST",
              quickReplies: ["Create service", "Edit service"],
              sessionId: session.sessionKey,
            });
          } catch (err) {
            const reply = `❌ Failed to list services: ${err?.message || "Unknown error"}`;
            await sessionManager.addMessage(session, "user", message);
            await sessionManager.addMessage(session, "jarvis", reply);
            return res.json({
              ok: false,
              reply,
              intent: "ADMIN_SERVICE_LIST_ERROR",
              quickReplies: ["Try again"],
              sessionId: session.sessionKey,
            });
          }
        }

        // PATCH_13: Delete service by ID or name
        if (wantsDeleteService) {
          try {
            let service = null;

            if (targetServiceId) {
              service = await Service.findById(targetServiceId);
            } else {
              // Try to find by name
              const nameMatch = String(message || "").match(
                /(?:delete|remove)\s+(?:service\s+)?(.+)/i,
              );
              if (nameMatch?.[1]) {
                const searchName = String(nameMatch[1]).trim();
                service = await Service.findOne({
                  title: { $regex: searchName, $options: "i" },
                });
              }
            }

            if (!service) {
              const reply =
                "Please specify the service ID or name to delete. Example: Delete service Airtm Payment";
              await sessionManager.addMessage(session, "user", message);
              await sessionManager.addMessage(session, "jarvis", reply);
              return res.json({
                ok: false,
                reply,
                intent: "ADMIN_SERVICE_DELETE_NEEDS_TARGET",
                quickReplies: ["List services", "Cancel"],
                sessionId: session.sessionKey,
              });
            }

            const deletedTitle = service.title;
            const deletedId = service._id;
            await Service.findByIdAndDelete(service._id);

            const reply = `✅ Service deleted: "${deletedTitle}" (ID: ${deletedId})`;
            await sessionManager.addMessage(session, "user", message);
            await sessionManager.addMessage(session, "jarvis", reply);
            return res.json({
              ok: true,
              reply,
              intent: "ADMIN_SERVICE_DELETE",
              quickReplies: ["List services", "Create service"],
              serviceId: String(deletedId),
              sessionId: session.sessionKey,
              realAction: true,
            });
          } catch (err) {
            const reply = `❌ Failed to delete service: ${err?.message || "Unknown error"}`;
            await sessionManager.addMessage(session, "user", message);
            await sessionManager.addMessage(session, "jarvis", reply);
            return res.json({
              ok: false,
              reply,
              intent: "ADMIN_SERVICE_DELETE_ERROR",
              quickReplies: ["Try again", "Cancel"],
              sessionId: session.sessionKey,
            });
          }
        }

        // Edit/update service by name (real DB write)
        // Example: "Edit HFM Japan -> becomes HFM Global KYC and add Mexico"
        if (wantsEditService) {
          try {
            const fromMatch = String(message || "").match(
              /(?:edit|update)\s+(.+?)(?:->|\s+to\s+|$)/i,
            );
            const becomesMatch = String(message || "").match(
              /becomes\s+(.+?)(?:\s+and|$)/i,
            );
            const addCountriesMatch = String(message || "").match(
              /\badd\s+([A-Za-z\s,]+)\b/i,
            );

            if (!fromMatch?.[1]) {
              const reply =
                "Please specify the service name to edit. Example: Edit HFM Japan -> becomes HFM Global KYC and add Mexico";
              await sessionManager.addMessage(session, "user", message);
              await sessionManager.addMessage(session, "jarvis", reply);
              return res.json({
                ok: false,
                reply,
                intent: "ADMIN_SERVICE_UPDATE_NEEDS_TARGET",
                quickReplies: ["List services", "Cancel"],
                sessionId: session.sessionKey,
              });
            }

            const fromName = String(fromMatch[1]).trim();
            const service = await Service.findOne({
              title: { $regex: fromName, $options: "i" },
            });

            if (!service) {
              const reply = `Service not found: "${fromName}"`;
              await sessionManager.addMessage(session, "user", message);
              await sessionManager.addMessage(session, "jarvis", reply);
              return res.json({
                ok: false,
                reply,
                intent: "ADMIN_SERVICE_UPDATE_NOT_FOUND",
                quickReplies: ["List services", "Cancel"],
                sessionId: session.sessionKey,
              });
            }

            if (becomesMatch?.[1]) {
              service.title = String(becomesMatch[1]).trim().slice(0, 140);
              service.slug = slugify(service.title);
            }

            if (addCountriesMatch?.[1]) {
              const list = String(addCountriesMatch[1])
                .split(/,\s*/)
                .map((x) => x.trim())
                .filter(Boolean);

              // Schema does not include countries, so append safely.
              if (list.length > 0) {
                const current = String(service.description || "").trim();
                const suffix = `Available countries: ${list.join(", ")}`;
                service.description = current
                  ? `${current}\n${suffix}`
                  : suffix;
              }
            }

            service.updatedAt = new Date();
            await service.save();

            const reply = `✅ Service updated successfully: "${service.title}" (ID: ${service._id})`;
            await sessionManager.addMessage(session, "user", message);
            await sessionManager.addMessage(session, "jarvis", reply);
            return res.json({
              ok: true,
              reply,
              intent: "ADMIN_SERVICE_UPDATE",
              quickReplies: ["Edit another", "Done"],
              serviceId: String(service._id),
              sessionId: session.sessionKey,
              realAction: true,
            });
          } catch (err) {
            const reply = `❌ Failed to update service: ${err?.message || "Unknown error"}`;
            await sessionManager.addMessage(session, "user", message);
            await sessionManager.addMessage(session, "jarvis", reply);
            return res.json({
              ok: false,
              reply,
              intent: "ADMIN_SERVICE_UPDATE_ERROR",
              quickReplies: ["Try again", "Cancel"],
              sessionId: session.sessionKey,
            });
          }
        }

        // Activate service by id
        if (wantsActivateService && targetServiceId) {
          try {
            const updated = await Service.findByIdAndUpdate(
              targetServiceId,
              { active: true },
              { new: true },
            );

            const reply = updated
              ? `Activated: ${updated.title} ($${updated.price}).`
              : "I couldn't find that service id to activate.";

            await sessionManager.addMessage(session, "user", message);
            await sessionManager.addMessage(session, "jarvis", reply);
            return res.json({
              ok: !!updated,
              reply,
              intent: updated
                ? "ADMIN_SERVICE_ACTIVATE"
                : "ADMIN_SERVICE_ACTIVATE_FAIL",
              quickReplies: updated
                ? ["Create service", "Orders"]
                : ["Try again"],
              sessionId: session.sessionKey,
            });
          } catch (err) {
            const reply = "Activation failed due to a database error.";
            await sessionManager.addMessage(session, "user", message);
            await sessionManager.addMessage(session, "jarvis", reply);
            return res.json({
              ok: false,
              reply,
              intent: "ADMIN_SERVICE_ACTIVATE_ERROR",
              quickReplies: ["Try again"],
              sessionId: session.sessionKey,
            });
          }
        }

        // If we previously asked for missing price, accept price and create
        if (session?.metadata?.pendingService && !wantsCreateService) {
          const price = parsePriceFromText(message);
          if (price !== null) {
            const pending = session.metadata.pendingService;
            try {
              const baseSlug = slugify(pending.title);
              const slug = await ensureUniqueServiceSlug(
                baseSlug || `service-${Date.now()}`,
              );

              const created = await Service.create({
                title: pending.title,
                slug,
                category: pending.category || "general",
                description: pending.description || "Service created by admin",
                price,
                currency: pending.currency || "USD",
                deliveryType: pending.deliveryType || "manual",
                active: true,
                createdBy: req.user?._id || req.user?.id,
              });

              delete session.metadata.pendingService;
              if (typeof session.save === "function") {
                await session.save();
              }

              const reply = `Created service: ${created.title} ($${created.price}).`;
              await sessionManager.addMessage(session, "user", message);
              await sessionManager.addMessage(session, "jarvis", reply);
              return res.json({
                ok: true,
                reply,
                intent: "ADMIN_SERVICE_CREATE",
                quickReplies: ["Create service", "Orders"],
                sessionId: session.sessionKey,
              });
            } catch (err) {
              const reply =
                "I tried to create the service, but the database write failed.";
              await sessionManager.addMessage(session, "user", message);
              await sessionManager.addMessage(session, "jarvis", reply);
              return res.json({
                ok: false,
                reply,
                intent: "ADMIN_SERVICE_CREATE_ERROR",
                quickReplies: ["Try again"],
                sessionId: session.sessionKey,
              });
            }
          }
        }

        // Create service
        if (wantsCreateService) {
          const price = parsePriceFromText(message);

          const titleMatch = String(message || "")
            .replace(/\s+/g, " ")
            .match(/service\s*(?:called|named)?\s*[:\-]?\s*"?([^"\n]+)"?/i);
          const title = (titleMatch ? titleMatch[1] : "New Service")
            .trim()
            .slice(0, 120);

          if (price === null) {
            session.metadata =
              session.metadata && typeof session.metadata === "object"
                ? session.metadata
                : {};
            session.metadata.pendingService = {
              title,
              category: "general",
              description: "Service created by admin",
              currency: "USD",
              deliveryType: "manual",
            };
            if (typeof session.save === "function") {
              await session.save();
            }

            const reply = `Got it. What's the price for "${title}"? (e.g. "$49" or "49 USD")`;
            await sessionManager.addMessage(session, "user", message);
            await sessionManager.addMessage(session, "jarvis", reply);
            return res.json({
              ok: true,
              reply,
              intent: "ADMIN_SERVICE_CREATE_NEEDS_PRICE",
              quickReplies: [],
              sessionId: session.sessionKey,
            });
          }

          try {
            const baseSlug = slugify(title);
            const slug = await ensureUniqueServiceSlug(
              baseSlug || `service-${Date.now()}`,
            );

            const created = await Service.create({
              title,
              slug,
              category: "general",
              description: "Service created by admin",
              price,
              currency: "USD",
              deliveryType: "manual",
              active: true,
              createdBy: req.user?._id || req.user?.id,
            });

            const reply = `Created service: ${created.title} ($${created.price}).`;
            await sessionManager.addMessage(session, "user", message);
            await sessionManager.addMessage(session, "jarvis", reply);
            return res.json({
              ok: true,
              reply,
              intent: "ADMIN_SERVICE_CREATE",
              quickReplies: ["Create service", "Orders"],
              sessionId: session.sessionKey,
            });
          } catch (err) {
            const reply =
              "I couldn't create the service because the database write failed.";
            await sessionManager.addMessage(session, "user", message);
            await sessionManager.addMessage(session, "jarvis", reply);
            return res.json({
              ok: false,
              reply,
              intent: "ADMIN_SERVICE_CREATE_ERROR",
              quickReplies: ["Try again"],
              sessionId: session.sessionKey,
            });
          }
        }
      }

      // Greeting fallback ONLY if it's a greeting AND there is no session history.
      if (brainV1IsGreeting(message) && !hasHistory) {
        await sessionManager.addMessage(session, "user", message);
        await sessionManager.addMessage(
          session,
          "jarvis",
          "Yes boss ✅ I'm here. What should I handle?",
        );
        return res.json({
          ok: true,
          reply: "Yes boss ✅ I'm here. What should I handle?",
          intent: "GREETING",
          quickReplies: [],
        });
      }

      const context = await getAdminContextObject();

      const system =
        "You are JarvisX Admin — a real AI assistant for the UREMO admin.\n" +
        "Rules:\n" +
        "- Be concise, action-oriented, and accurate.\n" +
        "- Never loop on greetings.\n" +
        "- Never claim you created/updated/edited/activated/deleted anything unless the server explicitly performed a database write in this request.\n" +
        "- Never ask for passwords, API keys, JWT secrets, or credentials.\n" +
        "- Never say you are a large language model.\n" +
        "- If you cannot do something, ask ONE clarifying question.\n\n" +
        `ADMIN CONTEXT JSON: ${JSON.stringify(context)}\n` +
        `SESSION DATA JSON: ${JSON.stringify(session.collectedData || {})}`;

      const history = (
        Array.isArray(session.conversation) ? session.conversation : []
      )
        .slice(-10)
        .map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          content: String(m.content || ""),
        }))
        .filter((m) => m.content.trim());

      try {
        const completion = await groqChatCompletion(
          [
            { role: "system", content: system },
            ...history,
            { role: "user", content: message },
          ],
          {
            temperature: 0.2,
            max_tokens: 350,
            model: String(process.env.JARVISX_MODEL || "").trim(),
          },
        );

        const text = completion?.choices?.[0]?.message?.content;
        const out = scrubAdminUnsafePhrases(
          typeof text === "string" ? text.trim() : "",
        );
        if (!out) {
          throw new Error("Empty LLM response");
        }

        await sessionManager.addMessage(session, "user", message);
        await sessionManager.addMessage(session, "jarvis", out);

        const responseTime = Date.now() - startTime;
        console.log(
          `[JarvisX] Intent: ADMIN_LLM, Provider: groq, Time: ${responseTime}ms`,
        );

        return res.json({
          ok: true,
          reply: out,
          intent: "ADMIN_LLM",
          quickReplies: [],
        });
      } catch (err) {
        console.error(`[JARVISX_LLM_DOWN] errMessage=${err?.message}`);
        return res.status(200).json({
          ok: false,
          reply:
            "JarvisX is temporarily unavailable. Please try again shortly.",
          intent: "ERROR",
          quickReplies: ["Retry", "Contact support"],
        });
      }
    }

    // =============================
    // PUBLIC MODE — STATE MACHINE + LLM
    // =============================
    const route = getQuickReplyRoute(message);
    if (route) {
      applyRouteToSession(session, route);
    }

    const classified = classifyIntentDetailed(message);
    const classifiedIntent = String(classified?.intent || "GENERAL_CHAT");
    const classifiedEntities = classified?.entities || {};

    // DIAG: confirm intent routing in logs (prod-safe; no PII)
    try {
      const snippet = String(message || "")
        .slice(0, 140)
        .replace(/\s+/g, " ");
      console.log(
        `[JARVISX_INTENT] intent=${classifiedIntent} platform=${String(
          classifiedEntities?.platform || "",
        )} msg="${snippet}"`,
      );
    } catch {
      // ignore
    }

    // Identity questions should NOT hijack flows.
    // If user is mid-flow, answer identity and keep the flow intact.
    if (
      !route &&
      hasActiveFlow(session) &&
      (classifiedIntent === "ASSISTANT_IDENTITY" ||
        classifiedIntent === "USER_IDENTITY_QUERY")
    ) {
      const out =
        classifiedIntent === "USER_IDENTITY_QUERY"
          ? buildUserIdentityReply(req)
          : buildAssistantIdentityReply();
      await sessionManager.addMessage(session, "user", message);
      await sessionManager.addMessage(session, "jarvis", out);
      return res.json({
        ok: true,
        reply: out,
        intent: classifiedIntent,
        quickReplies: ["Continue"],
      });
    }

    // List services (explicit)
    if (!route && classifiedIntent === "LIST_SERVICES") {
      const list = await Service.find({ active: true })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();
      const lines = (Array.isArray(list) ? list : [])
        .map((s) => `- ${String(s?.title || "").trim()}`)
        .filter(Boolean)
        .join("\n");
      const out = lines
        ? `Here are our current services:\n${lines}\n\nWhich one do you want?`
        : "No services are listed right now. Tell me what you need and I can create a custom request.";

      await sessionManager.addMessage(session, "user", message);
      await sessionManager.addMessage(session, "jarvis", out);
      return res.json({
        ok: true,
        reply: out,
        intent: "LIST_SERVICES",
        quickReplies: [],
      });
    }

    // Menu should be STRICT:
    // - ONLY when session has no history AND greeting-only
    // - OR user explicitly asks for menu/options
    if (
      !route &&
      (isExplicitMenuRequest(message) ||
        (!hasHistory && isGreetingOnly(message)))
    ) {
      const menu = buildPublicMenuReply(session);
      await sessionManager.addMessage(session, "user", message);
      await sessionManager.addMessage(session, "jarvis", menu.reply);
      return res.json({
        ok: true,
        reply: menu.reply,
        intent: "MENU",
        quickReplies: menu.quickReplies,
      });
    }

    // Identity questions — respond directly (NO menu)
    if (
      !route &&
      (classifiedIntent === "ASSISTANT_IDENTITY" ||
        classifiedIntent === "USER_IDENTITY_QUERY")
    ) {
      const out =
        classifiedIntent === "USER_IDENTITY_QUERY"
          ? buildUserIdentityReply(req)
          : buildAssistantIdentityReply();
      await sessionManager.addMessage(session, "user", message);
      await sessionManager.addMessage(session, "jarvis", out);
      return res.json({
        ok: true,
        reply: out,
        intent: classifiedIntent,
        quickReplies: ["Buy service", "Order status", "Interview help"],
      });
    }

    // Greeting should never override an active flow.
    if ((session.flow || session.step) && hasActiveFlow(session)) {
      // If user typed a quick reply (route), respond for the newly-set step.
      if (route) {
        const template = getStepResponse(session.flow, session.step, session);
        if (template) {
          let replyText = template.reply;
          if (template.showServices) {
            const list = await Service.find({ active: true })
              .sort({ createdAt: -1 })
              .limit(8)
              .lean();
            const lines = (Array.isArray(list) ? list : [])
              .map((s) => `- ${String(s?.title || "").trim()}`)
              .filter(Boolean)
              .join("\n");
            if (lines) replyText = `${replyText}\n\n${lines}`;
          }

          await session.save();
          await sessionManager.addMessage(session, "user", message);
          await sessionManager.addMessage(session, "jarvis", replyText);
          return res.json({
            ok: true,
            reply: replyText,
            intent: "FLOW",
            quickReplies: template.quickReplies || [],
            suggestedActions: template.suggestedActions || [],
          });
        }
      }

      // Otherwise treat this message as an answer to the current step.
      const stepBefore = String(session.step || "");
      const answer = message;
      if (!session.collectedData) session.collectedData = {};

      if (stepBefore === "ASK_SERVICE_TYPE") {
        session.collectedData.serviceType = answer;
      } else if (stepBefore === "LIST_SERVICES") {
        session.collectedData.serviceName = answer;
      } else if (stepBefore === "ASK_PLATFORM") {
        session.collectedData.platform = answer;
      } else if (stepBefore === "ASK_REGION") {
        session.collectedData.region = answer;
      } else if (stepBefore === "ASK_URGENCY") {
        session.collectedData.urgency = answer;
      } else if (stepBefore === "ASK_INTERVIEW_PLATFORM") {
        session.collectedData.platform = answer;
      }

      const progressed = advanceFlow(session, answer);
      if (progressed?.complete) {
        session.step = "COMPLETE";
      } else if (progressed?.nextStep) {
        session.step = progressed.nextStep;
      }

      await session.save();

      if (session.step === "COMPLETE") {
        const doneReply =
          "✅ Perfect — I’ve got what I need. Tell me any extra details, and I’ll guide you to the next step.";
        await sessionManager.addMessage(session, "user", message);
        await sessionManager.addMessage(session, "jarvis", doneReply);
        return res.json({
          ok: true,
          reply: doneReply,
          intent: "FLOW_COMPLETE",
          quickReplies: ["Talk to admin", "Contact support"],
        });
      }

      const nextTemplate = getStepResponse(session.flow, session.step, session);
      if (nextTemplate) {
        // Optional: show services list when requested.
        let replyText = nextTemplate.reply;
        if (nextTemplate.showServices) {
          const list = await Service.find({ active: true })
            .sort({ createdAt: -1 })
            .limit(8)
            .lean();
          const lines = (Array.isArray(list) ? list : [])
            .map((s) => `- ${String(s?.title || "").trim()}`)
            .filter(Boolean)
            .join("\n");
          if (lines) replyText = `${replyText}\n\n${lines}`;
        }

        await sessionManager.addMessage(session, "user", message);
        await sessionManager.addMessage(session, "jarvis", replyText);
        return res.json({
          ok: true,
          reply: replyText,
          intent: "FLOW",
          quickReplies: nextTemplate.quickReplies || [],
          suggestedActions: nextTemplate.suggestedActions || [],
        });
      }
    }

    // Keep legacy greeting behavior for non-exact greetings, but never show menu here.
    if (isPureGreeting(message) && !hasHistory) {
      const greeting = "Hi 👋 I’m JarvisX Support. Tell me what you need.";
      await sessionManager.addMessage(session, "user", message);
      await sessionManager.addMessage(session, "jarvis", greeting);
      return res.json({
        ok: true,
        reply: greeting,
        intent: "GREETING",
        quickReplies: [],
      });
    }

    const intent = classifiedIntent || classifyIntent(message);

    // Specific platform purchase request: suggest matching services or start custom request collection.
    if (intent === "SERVICE_PURCHASE_REQUEST") {
      const platform = normalizePlatform(classifiedEntities?.platform);
      const unitPrice = classifiedEntities?.unitPrice;
      const quantity = classifiedEntities?.quantity;

      // Try to match existing services first.
      const rx = platform ? new RegExp(escapeRegex(platform), "i") : null;
      const matches = rx
        ? await Service.find({
            active: true,
            $or: [{ title: rx }, { description: rx }, { category: rx }],
          })
            .sort({ createdAt: -1 })
            .limit(6)
            .lean()
        : [];

      if (Array.isArray(matches) && matches.length > 0) {
        const lines = matches
          .map((s) => `- ${String(s?.title || "").trim()}`)
          .filter(Boolean)
          .join("\n");
        const out = `I found services related to ${
          platform || "that platform"
        }:\n${lines}\n\nWhich one should I open for you?`;
        await sessionManager.addMessage(session, "user", message);
        await sessionManager.addMessage(session, "jarvis", out);
        return res.json({
          ok: true,
          reply: out,
          intent: "SERVICE_PURCHASE_REQUEST",
          quickReplies: [],
        });
      }

      // Not listed: start a minimal custom request flow.
      const out =
        `We don’t have ${
          platform || "that"
        } listed yet, but I can send a custom request to admin ✅\n` +
        `Is this for KYC or a ready account? Also: quantity and your target price per account.`;

      await sessionManager.addMessage(session, "user", message);
      await sessionManager.addMessage(session, "jarvis", out);

      return res.json({
        ok: true,
        reply: out,
        intent: "SERVICE_PURCHASE_REQUEST",
        quickReplies: ["KYC", "Ready account"],
        customRequestDraft: {
          sessionId: String(session?.sessionKey || ""),
          platform: platform || undefined,
          requestType: undefined,
          quantity:
            Number.isFinite(quantity) && quantity > 0 ? quantity : undefined,
          unitPrice:
            Number.isFinite(unitPrice) && unitPrice >= 0
              ? unitPrice
              : undefined,
          notes: "",
        },
      });
    }

    // PATCH_07: GENERAL_CHAT must always call Groq (real assistant behavior)
    if (intent === "GENERAL_CHAT") {
      try {
        const llm = getGroqStatus();
        if (!llm.configured) {
          const out =
            "JarvisX is temporarily offline. Please contact support or try again later.";
          await sessionManager.addMessage(session, "user", message);
          await sessionManager.addMessage(session, "jarvis", out);
          return res.status(200).json({
            ok: false,
            maintenance: true,
            message: out,
            reply: out,
            intent: "GENERAL_CHAT",
            quickReplies: ["Contact support", "Retry"],
          });
        }

        const services = await Service.find({ active: true })
          .sort({ createdAt: -1 })
          .limit(18)
          .lean();

        const system = buildJarvisxPublicSystemPrompt({ services });

        const history = (
          Array.isArray(session.conversation) ? session.conversation : []
        )
          .slice(-6)
          .map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: String(m.content || ""),
          }))
          .filter((m) => m.content.trim());

        const completion = await groqChatCompletion(
          [
            { role: "system", content: system },
            ...history,
            { role: "user", content: message },
          ],
          {
            temperature: 0.6,
            max_tokens: 220,
            model: String(process.env.JARVISX_MODEL || "").trim(),
            timeoutMs: 10000,
          },
        );

        const text = completion?.choices?.[0]?.message?.content;
        const out = typeof text === "string" ? text.trim() : "";
        if (!out) throw new Error("Empty LLM response");

        session.lastIntent = intent;
        await session.save();

        await sessionManager.addMessage(session, "user", message);
        await sessionManager.addMessage(session, "jarvis", out);

        const responseTime = Date.now() - startTime;
        console.log(
          `[JarvisX] Intent: GENERAL_CHAT, Provider: groq, Time: ${responseTime}ms`,
        );

        const showMenu = isExplicitMenuRequest(message);
        return res.json({
          ok: true,
          reply: out,
          intent: "GENERAL_CHAT",
          quickReplies: showMenu
            ? ["Buy service", "Order status", "Interview help", "Menu"]
            : [],
        });
      } catch (err) {
        console.error(`[JARVISX_PUBLIC_LLM_FAIL] errMessage=${err?.message}`);
        // Safe fallback: short, non-looping guidance (avoid auto-menu reset).
        const out =
          "I can help — tell me what you’re trying to do (buy a service, check an order, or interview help).";
        await sessionManager.addMessage(session, "user", message);
        await sessionManager.addMessage(session, "jarvis", out);
        return res.status(200).json({
          ok: false,
          message: out,
          reply: out,
          intent: "GENERAL_CHAT",
          quickReplies: ["Buy service", "Order status", "Interview help"],
        });
      }
    }
    const intentInfo = getIntentResponse(intent, isAdmin);
    const currentQuestionKey = intentInfo.nextQuestion;

    session.lastIntent = intent;
    await session.save();

    if (
      currentQuestionKey &&
      sessionManager.shouldRephrase(session, currentQuestionKey, message)
    ) {
      const rephrased = brainV1RephraseQuestion(currentQuestionKey);
      await sessionManager.addMessage(session, "user", message);
      await sessionManager.addMessage(session, "jarvis", rephrased);

      const responseTime = Date.now() - startTime;
      console.log(
        `[JarvisX] Intent: ${intent}, Provider: groq, Time: ${responseTime}ms`,
      );

      return res.json({
        ok: true,
        reply: rephrased,
        intent: "REPHRASE",
        quickReplies: intentInfo.quickReplies || [],
      });
    }

    if (
      currentQuestionKey &&
      sessionManager.hasAsked(session, currentQuestionKey)
    ) {
      const nextStep = brainV1GetNextStep(session, intent);
      await sessionManager.addMessage(session, "user", message);
      await sessionManager.addMessage(session, "jarvis", nextStep.reply);

      const responseTime = Date.now() - startTime;
      console.log(
        `[JarvisX] Intent: ${intent}, Provider: groq, Time: ${responseTime}ms`,
      );

      return res.json({
        ok: true,
        reply: nextStep.reply,
        intent,
        quickReplies: nextStep.quickReplies || [],
        requiresAction: intent === "CUSTOM_SERVICE",
      });
    }

    if (currentQuestionKey) {
      sessionManager.markAsked(session, currentQuestionKey);
      await session.save();
    }

    const reply = intentInfo.public;

    await sessionManager.addMessage(session, "user", message);
    await sessionManager.addMessage(session, "jarvis", reply);

    const responseTime = Date.now() - startTime;
    console.log(
      `[JarvisX] Intent: ${intent}, Provider: groq, Time: ${responseTime}ms`,
    );

    return res.json({
      ok: true,
      reply,
      intent,
      quickReplies: intentInfo.quickReplies || [],
      requiresAction: intent === "CUSTOM_SERVICE",
    });
  } catch (error) {
    console.error("[JarvisX Error]", error?.message);

    console.error("[JARVISX_FATAL]", error?.stack || error);

    // PATCH_08: Never return 500 for normal usage. Always degrade gracefully.
    const reply = wantsAdmin
      ? "System updating. Please check back in 2 minutes."
      : "Assistant is currently updating. Please try again in a moment.";

    return res.status(200).json({
      ok: false,
      message: reply,
      reply,
      intent: "ERROR",
      quickReplies: ["Retry", "Contact support"],
    });
  }
};

exports.requestService = async (req, res) => {
  try {
    const message = clampString(req.body?.message, 2000);
    const detectedServiceName = clampString(req.body?.detectedServiceName, 140);
    const page = clampString(req.body?.page, 200);

    if (!message) {
      return res
        .status(400)
        .json({ success: false, message: "message is required" });
    }

    const doc = await ServiceRequest.create({
      userId: req.user?.id || req.user?._id || undefined,
      source: "jarvisx",
      status: "new",
      rawMessage: message,
      requestedService: detectedServiceName || clampString(message, 200),
      captureStep: "",
      createdFrom: { page },
      events: [
        {
          type: "service_request_created",
          message: "Service request created from JarvisX",
          meta: { page },
        },
      ],
    });

    return res.json({ success: true, id: String(doc._id) });
  } catch (err) {
    console.error(`[JARVISX_REQUEST_SERVICE_FAIL] errMessage=${err?.message}`);
    return res
      .status(200)
      .json({ success: false, message: "Unable to create request" });
  }
};

exports.customRequest = async (req, res) => {
  try {
    const CustomRequest = require("../models/CustomRequest");
    const JarvisSession = require("../models/JarvisSession");

    const sessionId = clampString(req.body?.sessionId, 120);
    const platform = clampString(req.body?.platform, 60);
    const requestType = clampString(req.body?.requestType, 20);
    const notes = clampString(req.body?.notes, 2000);

    const rawQty = req.body?.quantity;
    const rawUnit = req.body?.unitPrice;
    const quantity = Number.isFinite(Number(rawQty)) ? Number(rawQty) : 1;
    const unitPrice =
      rawUnit === null || rawUnit === undefined || rawUnit === ""
        ? null
        : Number.isFinite(Number(rawUnit))
          ? Number(rawUnit)
          : null;

    if (!platform) {
      return res
        .status(400)
        .json({ ok: false, message: "platform is required" });
    }

    const normalizedType = ["KYC", "ACCOUNT", "OTHER"].includes(
      String(requestType || "").toUpperCase(),
    )
      ? String(requestType || "").toUpperCase()
      : "OTHER";

    const doc = await CustomRequest.create({
      sessionId: sessionId || JarvisSession.generateSessionKey(req),
      userId: req.user?.id || req.user?._id || undefined,
      platform: platform.toLowerCase(),
      requestType: normalizedType,
      quantity: quantity > 0 ? quantity : 1,
      unitPrice: unitPrice != null && unitPrice >= 0 ? unitPrice : undefined,
      notes: notes || "",
      status: "pending",
    });

    return res.status(200).json({
      ok: true,
      message: "Request sent to admin ✅",
      requestId: String(doc._id),
    });
  } catch (err) {
    console.error(`[JARVISX_CUSTOM_REQUEST_FAIL] errMessage=${err?.message}`);
    return res.status(200).json({
      ok: false,
      message: "Unable to send request right now. Please try again.",
    });
  }
};

exports.healthReport = async (req, res) => {
  try {
    const llm = getGroqStatus();
    const [
      totalServices,
      activeServices,
      totalWorkPositions,
      activeWorkPositions,
      totalPaymentMethods,
      activePaymentMethods,
      totalServiceRequests,
      newServiceRequests,
      draftServiceRequests,
      paymentProofPendingCount,
    ] = await Promise.all([
      Service.countDocuments({}),
      Service.countDocuments({ active: true }),
      WorkPosition.countDocuments({}),
      WorkPosition.countDocuments({ active: true }),
      PaymentMethod.countDocuments({}),
      PaymentMethod.countDocuments({ active: true }),
      ServiceRequest.countDocuments({}),
      ServiceRequest.countDocuments({ status: "new" }),
      ServiceRequest.countDocuments({ status: "draft" }),
      Order.countDocuments({
        status: { $in: ["payment_submitted", "review", "pending_review"] },
      }),
    ]);

    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      serverTime: new Date().toISOString(),
      llm,
      services: {
        total: totalServices,
        active: activeServices,
        missingHeroCount: 0,
      },
      workPositions: { total: totalWorkPositions, active: activeWorkPositions },
      paymentMethods: {
        total: totalPaymentMethods,
        active: activePaymentMethods,
      },
      serviceRequests: {
        total: totalServiceRequests,
        new: newServiceRequests,
        draft: draftServiceRequests,
      },
      orders: { paymentProofPendingCount },
      settings: { missingKeys: [] },
      jarvisx: { chatTotal24h: 0, chatOk24h: 0, chatErrorRate24h: 0 },
    });
  } catch (err) {
    console.error(`[JARVISX_HEALTH_FAIL] errMessage=${err?.message}`);
    // Always return safe JSON to avoid admin UI crashes.
    return res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      serverTime: new Date().toISOString(),
      llm: getGroqStatus(),
      services: { total: 0, active: 0, missingHeroCount: 0 },
      workPositions: { total: 0, active: 0 },
      paymentMethods: { total: 0, active: 0 },
      serviceRequests: { total: 0, new: 0, draft: 0 },
      orders: { paymentProofPendingCount: 0 },
      settings: { missingKeys: [] },
      jarvisx: { chatTotal24h: 0, chatOk24h: 0, chatErrorRate24h: 0 },
    });
  }
};

exports._internal = {
  getPublicContextObject,
  getAdminContextObject,
};
