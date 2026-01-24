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
  parseOrdinalSelection,
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

// PATCH_15: Extract category from natural language
function parseCategoryFromText(text) {
  const lower = String(text || "").toLowerCase();
  if (lower.includes("micro")) return "microjobs";
  if (lower.includes("forex") || lower.includes("crypto"))
    return "forex_crypto";
  if (
    lower.includes("bank") ||
    lower.includes("gateway") ||
    lower.includes("wallet")
  )
    return "banks_gateways_wallets";
  return "general";
}

// PATCH_15: Extract serviceType from natural language
function parseServiceTypeFromText(text) {
  const lower = String(text || "").toLowerCase();
  if (lower.includes("fresh") && lower.includes("profile"))
    return "fresh_profile";
  if (lower.includes("already") && lower.includes("onboard"))
    return "already_onboarded";
  if (lower.includes("interview") && lower.includes("process"))
    return "interview_process";
  if (lower.includes("interview") && lower.includes("passed"))
    return "interview_passed";
  return "general";
}

// PATCH_17: Extract listingType from natural language
function parseListingTypeFromText(text) {
  const lower = String(text || "").toLowerCase();
  if (
    lower.includes("fresh") ||
    lower.includes("fresh_account") ||
    lower.includes("kyc") ||
    lower.includes("screening")
  )
    return "fresh_account";
  if (
    lower.includes("already") ||
    lower.includes("onboard") ||
    lower.includes("already_onboarded") ||
    lower.includes("project-ready")
  )
    return "already_onboarded";
  return "general";
}

// PATCH_17: Extract platform from natural language
function parsePlatformFromText(text) {
  const lower = String(text || "").toLowerCase();
  const platformPatterns = [
    { pattern: /\boutlier\b/i, name: "Outlier" },
    { pattern: /\bscale\s*ai\b/i, name: "Scale AI" },
    { pattern: /\bdataannotation\b/i, name: "DataAnnotation" },
    { pattern: /\bremotasks\b/i, name: "Remotasks" },
    { pattern: /\bhandshake\b/i, name: "Handshake" },
    { pattern: /\bupwork\b/i, name: "Upwork" },
    { pattern: /\bfiverr\b/i, name: "Fiverr" },
    { pattern: /platform\s+(\w+)/i, name: null },
  ];
  for (const { pattern, name } of platformPatterns) {
    const match = text.match(pattern);
    if (match) {
      return name || match[1] || "";
    }
  }
  return "";
}

// PATCH_17: Extract subject from natural language
function parseSubjectFromText(text) {
  const lower = String(text || "").toLowerCase();
  const subjectPatterns = [
    { pattern: /subject\s+(\w+)/i, name: null },
    { pattern: /\bdentistry\b/i, name: "Dentistry" },
    { pattern: /\blaw\b/i, name: "Law" },
    { pattern: /\bmedicine\b/i, name: "Medicine" },
    { pattern: /\bsoftware\b/i, name: "Software" },
    { pattern: /\bcoding\b/i, name: "Coding" },
    { pattern: /\bmath\b/i, name: "Math" },
    { pattern: /\bwriting\b/i, name: "Writing" },
  ];
  for (const { pattern, name } of subjectPatterns) {
    const match = text.match(pattern);
    if (match) {
      return name || match[1] || "";
    }
  }
  return "";
}

// PATCH_17: Extract projectName from natural language
function parseProjectNameFromText(text) {
  const lower = String(text || "").toLowerCase();
  const projectPatterns = [
    {
      pattern:
        /project\s+([A-Za-z0-9_\-\s]+?)(?:\s+(?:pay|for|at|country|instant|\$)|$)/i,
      name: null,
    },
    { pattern: /\bvalkyrie\s*v?\d*/i, name: null },
    { pattern: /\baurora\b/i, name: "Aurora" },
    { pattern: /\bphoenix\b/i, name: "Phoenix" },
  ];
  for (const { pattern, name } of projectPatterns) {
    const match = text.match(pattern);
    if (match) {
      return (name || match[1] || match[0] || "").trim();
    }
  }
  return "";
}

// PATCH_17: Extract payRate from natural language
function parsePayRateFromText(text) {
  const match = String(text || "").match(
    /(?:payrate|pay\s*rate|hourly)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i,
  );
  if (match) {
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : 0;
  }
  return 0;
}

// PATCH_17: Extract instantDelivery from natural language
function parseInstantDeliveryFromText(text) {
  const lower = String(text || "").toLowerCase();
  return (
    lower.includes("instant") &&
    (lower.includes("true") ||
      lower.includes("delivery") ||
      lower.includes("yes"))
  );
}

// PATCH_15: Extract countries from natural language
function parseCountriesFromText(text) {
  const lower = String(text || "").toLowerCase();
  const countries = [];

  // Common country patterns
  const countryPatterns = [
    { pattern: /\bindia\b/i, name: "India" },
    { pattern: /\bmexico\b/i, name: "Mexico" },
    { pattern: /\busa\b|\bunited\s+states\b/i, name: "USA" },
    { pattern: /\buk\b|\bunited\s+kingdom\b/i, name: "UK" },
    { pattern: /\bcanada\b/i, name: "Canada" },
    { pattern: /\bgermany\b/i, name: "Germany" },
    { pattern: /\bfrance\b/i, name: "France" },
    { pattern: /\bjapan\b/i, name: "Japan" },
    { pattern: /\baustralia\b/i, name: "Australia" },
    { pattern: /\bbrazil\b/i, name: "Brazil" },
    { pattern: /\bpakistan\b/i, name: "Pakistan" },
    { pattern: /\bphilippines\b/i, name: "Philippines" },
    { pattern: /\bnigeria\b/i, name: "Nigeria" },
    { pattern: /\bkenya\b/i, name: "Kenya" },
    { pattern: /\bglobal\b/i, name: "Global" },
  ];

  for (const { pattern, name } of countryPatterns) {
    if (pattern.test(text)) {
      countries.push(name);
    }
  }

  return countries.length > 0 ? countries : ["Global"];
}

// PATCH_15: Check if message wants to activate the service
function wantsActivate(text) {
  const lower = String(text || "").toLowerCase();
  return (
    lower.includes("activate") ||
    lower.includes("publish") ||
    lower.includes("make active")
  );
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

      // PATCH_14: Extract and remember service IDs from URLs mentioned in message
      // e.g., "https://www.uremo.online/services/696ccf0118331ac9398714f8"
      {
        const serviceUrlMatch = String(message || "").match(
          /\/services\/([a-f0-9]{24})\b/i,
        );
        if (serviceUrlMatch?.[1]) {
          session.collectedData = session.collectedData || {};
          session.collectedData.lastMentionedServiceId = serviceUrlMatch[1];
          if (typeof session.save === "function") await session.save();
        }
      }

      // PATCH_11: Admin actions MUST be real (DB write) — never claim success otherwise.
      // We handle common service actions here to keep admin LLM honest.
      // PATCH_13: Extended to include delete and list services for admin
      {
        const lower = String(message || "").toLowerCase();
        const wantsEditService =
          /^(edit|update)\b/.test(lower) ||
          /\b(change|modify)\s+service\b/.test(lower) ||
          /\b(rename|edit\s+the\s+name)\b/.test(lower);
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

        // Edit/update service by name or ID (real DB write)
        // PATCH_14: Enhanced to support ID from context, URL, or natural language "edit the name to X"
        // Examples:
        //   "Edit HFM Japan -> becomes HFM Global KYC and add Mexico"
        //   "edit the name to airtm crypto gateway" (uses context service ID)
        //   "edit service 696ccf0118331ac9398714f8 title to New Name"
        if (wantsEditService) {
          try {
            let service = null;

            // PATCH_14: First try to find service by ID if provided in message or recent context
            if (targetServiceId) {
              service = await Service.findById(targetServiceId);
            }

            // PATCH_14: Check if user mentioned a service URL in recent conversation
            if (!service && session?.collectedData?.lastMentionedServiceId) {
              service = await Service.findById(
                session.collectedData.lastMentionedServiceId,
              );
            }

            // PATCH_14: Fallback - try to extract service name from message
            if (!service) {
              const fromMatch = String(message || "").match(
                /(?:edit|update)\s+(?:service\s+)?(.+?)(?:->|\s+to\s+|$)/i,
              );
              if (fromMatch?.[1]) {
                const fromName = String(fromMatch[1])
                  .replace(/^the\s+(name|title|service)\s*/i, "")
                  .trim();
                if (fromName && fromName.length > 2) {
                  service = await Service.findOne({
                    title: { $regex: escapeRegex(fromName), $options: "i" },
                  });
                }
              }
            }

            if (!service) {
              const reply =
                "Which service do you want to edit? Please provide the service ID, name, or URL.";
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

            // PATCH_14: Extract new title from various patterns
            const becomesMatch = String(message || "").match(
              /becomes\s+(.+?)(?:\s+and|$)/i,
            );
            const toMatch = String(message || "").match(
              /(?:name|title)(?:\s+in\s+real\s+time)?\s+to\s+(.+?)(?:\s+and|$)/i,
            );
            const renameMatch = String(message || "").match(
              /rename\s+(?:to\s+)?(.+?)(?:\s+and|$)/i,
            );
            const addCountriesMatch = String(message || "").match(
              /\badd\s+([A-Za-z\s,]+)\b/i,
            );

            const newTitle =
              becomesMatch?.[1] || toMatch?.[1] || renameMatch?.[1];
            if (newTitle) {
              service.title = String(newTitle).trim().slice(0, 140);
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

            // If nothing to update, ask for clarification
            if (!newTitle && !addCountriesMatch?.[1]) {
              const reply = `I found "${service.title}". What changes do you want to make? Example: rename to New Name, add Mexico`;
              session.collectedData = session.collectedData || {};
              session.collectedData.lastMentionedServiceId = String(
                service._id,
              );
              if (typeof session.save === "function") await session.save();

              await sessionManager.addMessage(session, "user", message);
              await sessionManager.addMessage(session, "jarvis", reply);
              return res.json({
                ok: true,
                reply,
                intent: "ADMIN_SERVICE_UPDATE_WAITING",
                quickReplies: ["Rename to...", "Update price", "Cancel"],
                serviceId: String(service._id),
                sessionId: session.sessionKey,
              });
            }

            service.updatedAt = new Date();
            await service.save();

            // Clear context
            if (session?.collectedData?.lastMentionedServiceId) {
              delete session.collectedData.lastMentionedServiceId;
              if (typeof session.save === "function") await session.save();
            }

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
        // PATCH_17: Enhanced with vision-aligned fields
        if (session?.metadata?.pendingService && !wantsCreateService) {
          const price = parsePriceFromText(message);
          if (price !== null) {
            const pending = session.metadata.pendingService;
            try {
              const baseSlug = slugify(pending.title);
              const slug = await ensureUniqueServiceSlug(
                baseSlug || `service-${Date.now()}`,
              );

              const shouldActivate = pending.shouldActivate !== false;

              const created = await Service.create({
                title: pending.title,
                slug,
                category: pending.category || "general",
                serviceType: pending.serviceType || "general",
                listingType: pending.listingType || "general",
                countries: pending.countries || ["Global"],
                platform: pending.platform || "",
                subject: pending.subject || "",
                projectName: pending.projectName || "",
                payRate: pending.payRate || 0,
                instantDelivery: pending.instantDelivery || false,
                status: shouldActivate ? "active" : "draft",
                description: pending.description || "Service created by admin",
                price,
                currency: pending.currency || "USD",
                deliveryType: pending.deliveryType || "manual",
                active: shouldActivate,
                createdBy: req.user?._id || req.user?.id,
              });

              delete session.metadata.pendingService;
              if (typeof session.save === "function") {
                await session.save();
              }

              const replyMsg = `Created service: ${created.title} ($${created.price}). ID: ${created._id}`;
              await sessionManager.addMessage(session, "user", message);
              await sessionManager.addMessage(session, "jarvis", replyMsg);
              return res.json({
                ok: true,
                reply: replyMsg,
                intent: "ADMIN_SERVICE_CREATE",
                quickReplies: ["Create service", "Orders"],
                serviceId: String(created._id),
                sessionId: session.sessionKey,
                realAction: true,
              });
            } catch (err) {
              const replyMsg =
                "I tried to create the service, but the database write failed.";
              await sessionManager.addMessage(session, "user", message);
              await sessionManager.addMessage(session, "jarvis", replyMsg);
              return res.json({
                ok: false,
                reply: replyMsg,
                intent: "ADMIN_SERVICE_CREATE_ERROR",
                quickReplies: ["Try again"],
                sessionId: session.sessionKey,
              });
            }
          }
        }

        // Create service
        // PATCH_17: Enhanced with vision-aligned fields (category, listingType, platform, subject, projectName, payRate, instantDelivery)
        if (wantsCreateService) {
          const price = parsePriceFromText(message);

          // PATCH_15: Better title extraction - handle patterns like "Create service Airtm - receive payments..."
          const titlePatterns = [
            /service\s+(?:called|named)?\s*[:\-]?\s*"?([^"$\n]+?)(?:\s+(?:for|at|category|type|country|listing|platform|subject|project|payrate|\$)|"|\s*$)/i,
            /create\s+(?:a\s+)?service\s+"?([^"$\n]+?)(?:\s+(?:for|at|category|type|country|listing|platform|subject|project|payrate|\$)|"|\s*$)/i,
            /add\s+(?:a\s+)?service\s+"?([^"$\n]+?)(?:\s+(?:for|at|category|type|country|listing|platform|subject|project|payrate|\$)|"|\s*$)/i,
          ];

          let title = "New Service";
          for (const pattern of titlePatterns) {
            const match = String(message || "")
              .replace(/\s+/g, " ")
              .match(pattern);
            if (match?.[1]) {
              title = match[1].trim().slice(0, 120);
              break;
            }
          }

          // PATCH_17: Extract vision-aligned fields from message
          const category = parseCategoryFromText(message);
          const serviceType = parseServiceTypeFromText(message);
          const listingType = parseListingTypeFromText(message);
          const countries = parseCountriesFromText(message);
          const platform = parsePlatformFromText(message);
          const subject = parseSubjectFromText(message);
          const projectName = parseProjectNameFromText(message);
          const payRate = parsePayRateFromText(message);
          const instantDelivery = parseInstantDeliveryFromText(message);
          const shouldActivate = wantsActivate(message);

          if (price === null) {
            session.metadata =
              session.metadata && typeof session.metadata === "object"
                ? session.metadata
                : {};
            session.metadata.pendingService = {
              title,
              category,
              serviceType,
              listingType,
              countries,
              platform,
              subject,
              projectName,
              payRate,
              instantDelivery,
              description: "Service created by admin",
              currency: "USD",
              deliveryType: "manual",
              shouldActivate,
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
              category,
              serviceType,
              listingType,
              countries,
              platform,
              subject,
              projectName,
              payRate,
              instantDelivery,
              status: shouldActivate ? "active" : "draft",
              description: "Service created by admin",
              price,
              currency: "USD",
              deliveryType: "manual",
              active: shouldActivate,
              createdBy: req.user?._id || req.user?.id,
            });

            const activateNote = shouldActivate ? " (activated)" : " (draft)";
            const countryNote =
              countries.length > 0 ? ` for ${countries.join(", ")}` : "";
            const platformNote = platform ? ` platform: ${platform}` : "";
            const reply = `✅ Created service: "${created.title}" $${created.price}${countryNote}${platformNote}${activateNote}. ID: ${created._id}`;
            await sessionManager.addMessage(session, "user", message);
            await sessionManager.addMessage(session, "jarvis", reply);
            return res.json({
              ok: true,
              reply,
              intent: "ADMIN_SERVICE_CREATE",
              quickReplies: ["Create service", "List services", "Orders"],
              serviceId: String(created._id),
              sessionId: session.sessionKey,
              realAction: true,
            });
          } catch (err) {
            const errReply = `❌ Failed to create service: ${err?.message || "Database write failed"}`;
            await sessionManager.addMessage(session, "user", message);
            await sessionManager.addMessage(session, "jarvis", errReply);
            return res.json({
              ok: false,
              reply: errReply,
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

    // PATCH_21: Admin create service command
    if (!route && classifiedIntent === "ADMIN_CREATE_SERVICE" && isAdmin) {
      const out = `Yes boss ✅ I can help you create a new service. Please provide the following details:

**Required:**
1. **Title** - Service name (e.g., "Outlier Math Expert Support")
2. **Category** - microjobs, forex_crypto, banks_gateways_wallets, or rentals
3. **Price** - Base price in USD

**Optional (but recommended):**
4. **Subcategory** - fresh_account, already_onboarded, forex_platform_creation, etc.
5. **Platform** - Outlier, Bybit, PayPal, etc.
6. **Subject** - Math, Coding, Dentistry (for fresh accounts)
7. **Countries** - India, USA, UK, Global
8. **Description** - Full service description

You can also say something like:
_"Create service: Bybit KYC Account, category forex_crypto, price $45, platform Bybit, countries India and UAE"_

Or I can guide you step by step. What would you prefer?`;

      session.currentFlow = "admin_create_service";
      session.currentStep = "collect_details";
      session.collectedData = {};
      await session.save();

      await sessionManager.addMessage(session, "user", message);
      await sessionManager.addMessage(session, "jarvis", out);
      return res.json({
        ok: true,
        reply: out,
        intent: "ADMIN_CREATE_SERVICE",
        quickReplies: ["Guide me step by step", "I'll provide all details"],
      });
    }

    // PATCH_19: List services (explicit) - grouped by category/subcategory
    // PATCH_20: Store service IDs for ordinal selection
    if (!route && classifiedIntent === "LIST_SERVICES") {
      try {
        const list = await Service.find({ active: true })
          .select("title price category subcategory countries platform")
          .sort({ category: 1, subcategory: 1, createdAt: -1 })
          .limit(50)
          .lean();

        if (!Array.isArray(list) || list.length === 0) {
          const out =
            "No services are listed right now. Tell me what you need and I can create a custom request.";
          await sessionManager.addMessage(session, "user", message);
          await sessionManager.addMessage(session, "jarvis", out);
          return res.json({
            ok: true,
            reply: out,
            intent: "LIST_SERVICES",
            quickReplies: ["Create request to Admin", "Buy service"],
          });
        }

        // PATCH_19: Group services by category then subcategory
        const grouped = {};
        const categoryLabels = {
          microjobs: "Microjobs",
          forex_crypto: "Forex/Crypto",
          banks_gateways_wallets: "Banks/Gateways/Wallets",
        };
        const subcategoryLabels = {
          fresh_account: "Fresh Account",
          already_onboarded: "Already Onboarded",
          forex_platform_creation: "Forex Platform Creation",
          crypto_platform_creation: "Crypto Platform Creation",
          banks: "Banks",
          payment_gateways: "Payment Gateways",
          wallets: "Wallets",
        };

        for (const s of list) {
          const cat = s.category || "general";
          const subcat = s.subcategory || s.listingType || "general";
          const key = `${cat}::${subcat}`;
          if (!grouped[key]) {
            grouped[key] = { category: cat, subcategory: subcat, services: [] };
          }
          grouped[key].services.push(s);
        }

        // Build formatted output with numbered list
        let out = "Here are our current services:\n\n";
        const sortedGroups = Object.values(grouped).sort((a, b) => {
          const catOrder = [
            "microjobs",
            "forex_crypto",
            "banks_gateways_wallets",
          ];
          const aIdx = catOrder.indexOf(a.category);
          const bIdx = catOrder.indexOf(b.category);
          if (aIdx !== bIdx) return aIdx - bIdx;
          return a.subcategory.localeCompare(b.subcategory);
        });

        // PATCH_20: Build numbered flat list for ordinal selection
        const flatServices = [];
        let serviceNum = 0;
        for (const group of sortedGroups) {
          const catLabel =
            categoryLabels[group.category] || group.category.replace(/_/g, " ");
          const subcatLabel =
            subcategoryLabels[group.subcategory] ||
            group.subcategory.replace(/_/g, " ");
          out += `**${catLabel} → ${subcatLabel}:**\n`;
          for (const s of group.services.slice(0, 5)) {
            serviceNum++;
            flatServices.push({ _id: s._id, title: s.title });
            const price = s.price ? ` ($${s.price})` : "";
            out += `${serviceNum}. ${s.title}${price}\n`;
          }
          if (group.services.length > 5) {
            out += `  ...and ${group.services.length - 5} more\n`;
          }
          out += "\n";
        }

        out += "Reply with a number (1, 2, 3...) or service name to select.";

        // PATCH_20: Store service IDs in session metadata for ordinal selection
        if (!session.metadata) session.metadata = {};
        session.metadata.lastServiceOptions = flatServices.map((s) => ({
          _id: String(s._id),
          title: s.title,
        }));
        session.metadata.lastIntent = "LIST_SERVICES";
        await session.save();

        await sessionManager.addMessage(session, "user", message);
        await sessionManager.addMessage(session, "jarvis", out);
        return res.json({
          ok: true,
          reply: out,
          intent: "LIST_SERVICES",
          quickReplies: ["1", "2", "3", "More info"],
        });
      } catch (err) {
        console.error("[JarvisX] LIST_SERVICES error:", err);
        const out =
          "Sorry, I couldn't load services right now. Please try again or visit the Buy Service page.";
        await sessionManager.addMessage(session, "user", message);
        await sessionManager.addMessage(session, "jarvis", out);
        return res.json({
          ok: false,
          reply: out,
          intent: "LIST_SERVICES_ERROR",
          quickReplies: ["Try again", "Buy service"],
        });
      }
    }

    // PATCH_20: Handle ordinal selection from service list ("1", "first", "option 2")
    if (!route && classifiedIntent === "ORDINAL_SELECTION") {
      const lastServiceOptions = session.metadata?.lastServiceOptions;
      const lastIntent = session.metadata?.lastIntent;

      if (
        lastIntent === "LIST_SERVICES" &&
        Array.isArray(lastServiceOptions) &&
        lastServiceOptions.length > 0
      ) {
        const ordinalIndex = parseOrdinalSelection(message);
        if (ordinalIndex && ordinalIndex <= lastServiceOptions.length) {
          const selected = lastServiceOptions[ordinalIndex - 1];
          const serviceId = selected._id;
          const serviceTitle = selected.title;

          // Fetch full service details
          let service = null;
          try {
            service = await Service.findById(serviceId).lean();
          } catch {
            // fallback handled below
          }

          if (service) {
            // Start purchase flow with this service
            session.collectedData = session.collectedData || {};
            session.collectedData.serviceName = service.title;
            session.collectedData.platform = service.platform || "";
            session.collectedData.serviceId = String(service._id);
            session.currentFlow = "purchase";
            session.currentStep = "confirm_service";

            // Clear lastServiceOptions to avoid stale data
            session.metadata.lastServiceOptions = null;
            session.metadata.lastIntent = "SERVICE_SELECTED";
            await session.save();

            const price = service.price
              ? `$${service.price}`
              : "Contact for price";
            const out = `Great choice! You selected **${service.title}** (${price}). How many do you need?`;

            await sessionManager.addMessage(session, "user", message);
            await sessionManager.addMessage(session, "jarvis", out);
            return res.json({
              ok: true,
              reply: out,
              intent: "SERVICE_SELECTED",
              quickReplies: ["1", "2", "5", "10"],
            });
          }

          // Fallback if service not found
          const out = `Sorry, I couldn't find service "${serviceTitle}". Let me show you the services again.`;
          await sessionManager.addMessage(session, "user", message);
          await sessionManager.addMessage(session, "jarvis", out);
          return res.json({
            ok: true,
            reply: out,
            intent: "SERVICE_NOT_FOUND",
            quickReplies: ["Show services"],
          });
        }

        // Invalid ordinal number
        const out = `Please select a number between 1 and ${lastServiceOptions.length}, or type the service name.`;
        await sessionManager.addMessage(session, "user", message);
        await sessionManager.addMessage(session, "jarvis", out);
        return res.json({
          ok: true,
          reply: out,
          intent: "INVALID_SELECTION",
          quickReplies: ["1", "2", "Show services"],
        });
      }

      // PATCH_21: No lastServiceOptions context - give helpful response
      // instead of confusing FLOW response
      const numericInput = parseInt(String(message).trim(), 10);
      if (Number.isFinite(numericInput) && numericInput > 0) {
        // User typed a number but we don't have context
        const out = `I see you selected option ${numericInput}, but I'm not sure what you're referring to. Would you like me to show you our available services?`;
        await sessionManager.addMessage(session, "user", message);
        await sessionManager.addMessage(session, "jarvis", out);
        return res.json({
          ok: true,
          reply: out,
          intent: "ORDINAL_NO_CONTEXT",
          quickReplies: ["Show services", "Buy service", "Help"],
        });
      }
      // Fall through for non-numeric ordinal words
    }

    // Legacy: List services (explicit) - kept for backward compatibility
    if (!route && false && classifiedIntent === "LIST_SERVICES_LEGACY") {
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

    // PATCH_21: Pure greetings mid-flow should reset the flow and show menu
    // This prevents confusion when user wants to start fresh
    if (!route && isGreetingOnly(message) && hasActiveFlow(session)) {
      // Reset the session flow
      session.flow = null;
      session.step = null;
      session.currentFlow = null;
      session.currentStep = null;
      session.collectedData = {};
      if (session.metadata) {
        session.metadata.lastServiceOptions = null;
        session.metadata.lastIntent = null;
      }
      await session.save();

      const menu = buildPublicMenuReply(session);
      await sessionManager.addMessage(session, "user", message);
      await sessionManager.addMessage(session, "jarvis", menu.reply);
      return res.json({
        ok: true,
        reply: menu.reply,
        intent: "GREETING_RESET",
        quickReplies: menu.quickReplies,
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
        quickReplies: ["KYC/Fresh", "Already Onboarded", "Need help"],
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
