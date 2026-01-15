const jwt = require("jsonwebtoken");
const SiteSettingsController = require("./siteSettings.controller");
const Service = require("../models/Service");
const PaymentMethod = require("../models/PaymentMethod");
const WorkPosition = require("../models/WorkPosition");
const mongoose = require("mongoose");
const ServiceRequest = require("../models/ServiceRequest");

const JARVISX_RULES = {
  manualVerification: true,
  proofAccepted: ["image", "pdf"],
  verificationTime: "5-60 minutes",
};

function clampString(value, maxLen) {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!v) return "";
  return v.length <= maxLen ? v : v.slice(0, maxLen);
}

function toBool(v) {
  return !!v;
}

function isAdminUser(req) {
  return req.user?.role === "admin";
}

async function getPublicContextObject() {
  const settings = await SiteSettingsController.getPublicSettingsObject();

  const [services, paymentMethods, workPositions] = await Promise.all([
    Service.find({ active: true })
      .select("_id title price description imageUrl active")
      .lean(),
    PaymentMethod.find({ active: true })
      .select("_id name details instructions active")
      .lean(),
    WorkPosition.find({ active: true })
      .select("_id title category description requirements active sortOrder")
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean(),
  ]);

  const normalizedServices = (Array.isArray(services) ? services : []).map(
    (s) => ({
      id: s._id,
      title: s.title,
      price: s.price,
      description: s.description,
      imageUrl: s.imageUrl || "",
    })
  );

  const normalizedPaymentMethods = (
    Array.isArray(paymentMethods) ? paymentMethods : []
  ).map((m) => ({
    id: m._id,
    name: m.name,
    details: m.details,
    instructions: m.instructions || "",
  }));

  const normalizedWorkPositions = (
    Array.isArray(workPositions) ? workPositions : []
  ).map((p) => ({
    id: p._id,
    title: p.title,
    category: p.category,
    description: p.description || "",
    requirements: p.requirements || "",
  }));

  return {
    settings,
    services: normalizedServices,
    paymentMethods: normalizedPaymentMethods,
    workPositions: normalizedWorkPositions,
    rules: JARVISX_RULES,
  };
}

async function getAdminContextObject() {
  const settings = await SiteSettingsController.getAdminSettingsObject();

  const [services, paymentMethods, workPositions] = await Promise.all([
    Service.find({}).sort({ createdAt: -1 }).lean(),
    PaymentMethod.find({}).sort({ createdAt: -1 }).lean(),
    WorkPosition.find({})
      .sort({ active: -1, sortOrder: 1, createdAt: -1 })
      .lean(),
  ]);

  return {
    settings,
    services: Array.isArray(services) ? services : [],
    paymentMethods: Array.isArray(paymentMethods) ? paymentMethods : [],
    workPositions: Array.isArray(workPositions) ? workPositions : [],
    rules: JARVISX_RULES,
  };
}

function extractToken(req) {
  const headerToken = req.headers.authorization?.split(" ")[1];
  if (typeof headerToken === "string" && headerToken.trim()) return headerToken;
  return null;
}

function tryAttachUser(req) {
  const token = extractToken(req);
  if (!token) return;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    const normalized = {
      ...(decoded && typeof decoded === "object" ? decoded : {}),
    };
    normalized.id =
      normalized.id || normalized._id || normalized.userId || normalized.uid;
    req.user = normalized;
  } catch {
    // optional auth: ignore invalid token
  }
}

function buildNotSureReply() {
  return {
    reply: "I’m not sure. Please contact admin in Order Support Chat.",
    confidence: 0.2,
    usedSources: [],
    suggestedActions: [],
  };
}

function normalizeTextForMatch(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findMatchingServiceTitle(message, services) {
  const msg = normalizeTextForMatch(message);
  if (!msg) return null;

  const list = Array.isArray(services) ? services : [];
  for (const s of list) {
    const title = String(s?.title || "").trim();
    if (!title) continue;
    const t = normalizeTextForMatch(title);
    if (!t) continue;

    // direct contains either direction, or strong token overlap
    if (msg.includes(t) || t.includes(msg)) return title;

    const msgTokens = msg.split(" ").filter((x) => x.length >= 4);
    const titleTokens = new Set(t.split(" ").filter((x) => x.length >= 4));
    const overlap = msgTokens.filter((x) => titleTokens.has(x)).length;
    if (overlap >= 2) return title;
  }
  return null;
}

function isServiceRequestIntent(message) {
  const msg = String(message || "").toLowerCase();
  return (
    /(i\s*(need|want|require)|looking\s*for|can\s*you\s*(do|help)|do\s*you\s*(offer|provide)|service\s*for|help\s*me\s*with)/.test(
      msg
    ) &&
    /(service|account|kyc|verification|outlier|paypal|binance|stripe|payment|ads|instagram|tiktok|facebook|google|shopify|amazon|upwork|fiverr)/.test(
      msg
    )
  );
}

function wantsCancel(message) {
  const msg = String(message || "").toLowerCase();
  return /(cancel|never mind|nevermind|stop|forget it|abort)/.test(msg);
}

function parseBudget(message) {
  const msg = String(message || "").toLowerCase();
  const m = msg.match(
    /(\$|usd|eur|ngn|gbp)?\s*([0-9]{2,7})(?:\s*(\$|usd|eur|ngn|gbp))?/i
  );
  if (!m) return null;
  const amount = Number(m[2]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const currencyRaw = (m[1] || m[3] || "usd").toLowerCase();
  const currency =
    currencyRaw === "$" ? "USD" : currencyRaw.toUpperCase().slice(0, 3);
  return { amount, currency };
}

function normalizeUrgencyFromAnswer(answer) {
  const v = String(answer || "")
    .trim()
    .toLowerCase();
  if (!v) return "";
  if (/(asap|urgent|now|today)/.test(v)) return "asap";
  if (/(week|7)/.test(v)) return "this_week";
  if (/(month|30)/.test(v)) return "this_month";
  if (/(flex|any|whenever|no rush)/.test(v)) return "flexible";
  if (["asap", "this_week", "this_month", "flexible"].includes(v)) return v;
  return "";
}

function nextLeadQuestion(doc) {
  if (!doc.requestedService) {
    return {
      key: "requestedService",
      text: "What service do you need exactly? (Describe it in 1 sentence.)",
    };
  }
  if (!doc.platform) {
    return {
      key: "platform",
      text: "Which platform is this for? (e.g., Outlier, PayPal, Binance, TikTok, Instagram, Shopify)",
    };
  }
  if (!doc.country) {
    return {
      key: "country",
      text: "Which country/region should we target?",
    };
  }
  if (!doc.urgency) {
    return {
      key: "urgency",
      text: "How urgent is it? Reply with: ASAP, this week, this month, or flexible.",
    };
  }
  // budget is optional; treat undefined as "not answered yet" (null = skipped)
  if (doc.budget === undefined) {
    return {
      key: "budget",
      text: "Optional: what’s your budget range? (You can reply like “$50” or “skip”)",
    };
  }
  return null;
}

function buildLeadCaptureReply({ text, requestId, stepKey }) {
  const out = {
    reply: text,
    confidence: 0.85,
    usedSources: [],
    suggestedActions: [{ label: "Support", url: "/support" }],
    leadCapture: {
      requestId,
      step: stepKey || "",
    },
  };
  return out;
}

function buildSuggestedActionsFromMessage(message) {
  const msg = String(message || "").toLowerCase();
  const actions = [];

  if (/(service|buy|browse|order|kyc|outlier)/.test(msg)) {
    actions.push({ label: "Browse Services", url: "/buy-service" });
  }
  if (/(payment|proof|receipt|transaction)/.test(msg)) {
    actions.push({ label: "Payment", url: "/payment" });
  }
  if (/(order|support|chat)/.test(msg)) {
    actions.push({ label: "My Orders", url: "/orders" });
  }
  if (/(apply|work|job|position)/.test(msg)) {
    actions.push({ label: "Apply to Work", url: "/apply-to-work" });
  }

  // de-dupe by url
  const seen = new Set();
  return actions.filter((a) => {
    const key = String(a.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fallbackAnswerFromContext(input) {
  const message = String(input?.message || "");
  const msg = message.toLowerCase();

  const settings = input?.context?.settings || {};
  const services = Array.isArray(input?.context?.services)
    ? input.context.services
    : [];

  // Payment proof / verification FAQs
  if (/(proof|pdf|screenshot|verification|verify|payment)/.test(msg)) {
    const accepted =
      settings?.payment?.acceptedProofText ||
      "Accepted proof: Screenshot/PDF with transaction ID, amount, and receiver details.";

    const faq = Array.isArray(settings?.payment?.faq)
      ? settings.payment.faq
      : [];
    const faqLine = faq.length ? `\n\nFAQ: ${faq[0].q} — ${faq[0].a}` : "";

    return {
      reply: `${accepted}${faqLine}`.trim(),
      confidence: 0.75,
      usedSources: ["settings"],
      suggestedActions: buildSuggestedActionsFromMessage(message),
    };
  }

  // Apply-to-work FAQs
  if (/(apply|work|job|position|resume)/.test(msg)) {
    const faq = Array.isArray(settings?.applyWork?.faq)
      ? settings.applyWork.faq
      : [];

    if (faq.length) {
      const top = faq.slice(0, 2);
      const lines = top.map((x) => `- ${x.q}: ${x.a}`).join("\n");
      return {
        reply: `Here’s what I can confirm:\n${lines}`,
        confidence: 0.7,
        usedSources: ["settings", "workPositions"],
        suggestedActions: buildSuggestedActionsFromMessage(message),
      };
    }

    return {
      reply:
        "To apply, open Apply to Work and choose a position. If you’re unsure, please contact admin in Order Support Chat.",
      confidence: 0.55,
      usedSources: ["workPositions"],
      suggestedActions: buildSuggestedActionsFromMessage(message),
    };
  }

  // Service browsing / specific service hint
  if (/(service|buy|browse|kyc|outlier|order)/.test(msg)) {
    // Try to find a matching service by title keywords.
    const tokens = msg
      .split(/[^a-z0-9]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10);

    const match = services.find((s) => {
      const title = String(s?.title || "").toLowerCase();
      if (!title) return false;
      return tokens.some((t) => t.length >= 4 && title.includes(t));
    });

    const reply = match
      ? `To buy ${match.title}, go to Buy Service and place an order.`
      : "To buy a service, open Buy Service, choose a service, then place an order.";

    return {
      reply,
      confidence: match ? 0.7 : 0.6,
      usedSources: ["services"],
      suggestedActions: [{ label: "Browse Services", url: "/buy-service" }],
    };
  }

  // Support contacts
  if (/(support|whatsapp|email|contact)/.test(msg)) {
    const whatsapp = String(settings?.support?.whatsappNumber || "").trim();
    const email = String(settings?.support?.supportEmail || "").trim();

    const parts = [];
    if (whatsapp) parts.push(`WhatsApp: ${whatsapp}`);
    if (email) parts.push(`Email: ${email}`);

    return {
      reply:
        parts.length > 0
          ? parts.join("\n")
          : "Please contact admin in Order Support Chat.",
      confidence: parts.length > 0 ? 0.7 : 0.4,
      usedSources: ["settings"],
      suggestedActions: buildSuggestedActionsFromMessage(message),
    };
  }

  return buildNotSureReply();
}

async function callChatCompletion({ provider, apiKey, model, messages }) {
  const url =
    provider === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  // OpenRouter optional headers (safe if missing)
  if (provider === "openrouter") {
    if (process.env.OPENROUTER_SITE_URL)
      headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
    if (process.env.OPENROUTER_APP_NAME)
      headers["X-Title"] = process.env.OPENROUTER_APP_NAME;
  }

  const body = {
    model,
    messages,
    temperature: 0.2,
    max_tokens: 300,
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      payload?.error?.message ||
      payload?.message ||
      `JarvisX provider error (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  const content = payload?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

function safeJsonParse(maybeJson) {
  if (typeof maybeJson !== "string") return null;
  const trimmed = maybeJson.trim();
  if (!trimmed) return null;

  // Strip ```json fences if present
  const unfenced = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    return null;
  }
}

function normalizeAiResponse(raw, inputMessage) {
  const fallback = buildNotSureReply();
  const obj = raw && typeof raw === "object" ? raw : null;
  if (!obj) return fallback;

  const reply = clampString(obj.reply, 1200);
  if (!reply) return fallback;

  const confidenceRaw = Number(obj.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : 0.5;

  const allowedSources = new Set([
    "settings",
    "services",
    "paymentMethods",
    "workPositions",
    "rules",
  ]);

  const usedSources = Array.isArray(obj.usedSources)
    ? obj.usedSources
        .map((s) => String(s).trim())
        .filter((s) => allowedSources.has(s))
        .slice(0, 5)
    : [];

  const suggestedActions = Array.isArray(obj.suggestedActions)
    ? obj.suggestedActions
        .filter((a) => a && typeof a === "object")
        .map((a) => ({
          label: clampString(a.label, 40),
          url: clampString(a.url, 200),
        }))
        .filter((a) => a.label && a.url)
        .slice(0, 4)
    : buildSuggestedActionsFromMessage(inputMessage);

  // Safety: if the model claims high confidence without any sources, dampen it.
  const finalConfidence =
    usedSources.length === 0 ? Math.min(confidence, 0.5) : confidence;

  return {
    reply,
    confidence: finalConfidence,
    usedSources,
    suggestedActions,
  };
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
  // Optional auth: if token present, attach req.user
  tryAttachUser(req);

  const message = clampString(req.body?.message, 1200);
  const modeRaw = String(req.body?.mode || "public").trim();
  const mode = modeRaw === "admin" ? "admin" : "public";

  if (!message) {
    return res.status(400).json({ message: "Message is required" });
  }

  if (mode === "admin") {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!isAdminUser(req)) {
      return res.status(403).json({ message: "Admin access required" });
    }
  }

  const meta =
    req.body?.meta && typeof req.body.meta === "object" ? req.body.meta : {};
  const orderId = clampString(meta.orderId, 64);
  const page = clampString(meta.page, 120);

  // Lead capture state (client echoes this back to keep the flow going)
  const leadCaptureMeta =
    meta?.leadCapture && typeof meta.leadCapture === "object"
      ? meta.leadCapture
      : null;
  const pendingRequestId = clampString(leadCaptureMeta?.requestId, 64);

  try {
    const context =
      mode === "admin"
        ? await getAdminContextObject()
        : await getPublicContextObject();

    // --- Lead capture (public mode only) ---
    if (mode === "public") {
      // Resume an in-progress draft request
      if (
        pendingRequestId &&
        mongoose.Types.ObjectId.isValid(pendingRequestId)
      ) {
        const draft = await ServiceRequest.findById(pendingRequestId);

        if (draft && draft.status === "draft") {
          if (wantsCancel(message)) {
            draft.status = "cancelled";
            draft.captureStep = "cancelled";
            draft.events = draft.events || [];
            draft.events.push({
              type: "cancelled",
              message: "User cancelled lead capture",
              meta: { page },
            });
            await draft.save();

            return res.json(
              buildLeadCaptureReply({
                text: "No problem — I’ve cancelled that request. If you need anything else, just tell me.",
                requestId: String(draft._id),
                stepKey: "cancelled",
              })
            );
          }

          const q = nextLeadQuestion(draft);
          if (q) {
            // Treat this message as answer to the current question
            const answer = clampString(message, 400);

            if (q.key === "requestedService") {
              draft.requestedService = answer;
            } else if (q.key === "platform") {
              draft.platform = answer;
            } else if (q.key === "country") {
              draft.country = answer;
            } else if (q.key === "urgency") {
              const u = normalizeUrgencyFromAnswer(answer);
              if (u) draft.urgency = u;
            } else if (q.key === "budget") {
              if (/^(skip|no|n\/a|none)$/i.test(answer)) {
                draft.budget = null;
                draft.budgetProvided = false;
              } else {
                const parsed = parseBudget(answer);
                if (parsed) {
                  draft.budget = parsed.amount;
                  draft.budgetCurrency = parsed.currency;
                  draft.budgetProvided = true;
                }
              }
            }

            draft.events = draft.events || [];
            draft.events.push({
              type: "user_answer",
              message: `Answered ${q.key}`,
              meta: { page },
            });
            await draft.save();

            const nextQ = nextLeadQuestion(draft);
            if (nextQ) {
              draft.captureStep = nextQ.key;
              await draft.save();
              return res.json(
                buildLeadCaptureReply({
                  text: nextQ.text,
                  requestId: String(draft._id),
                  stepKey: nextQ.key,
                })
              );
            }

            // Finalize
            draft.status = "new";
            draft.captureStep = "created";
            draft.events.push({
              type: "created",
              message: "Service request created via JarvisX",
              meta: { page },
            });
            await draft.save();

            return res.json(
              buildLeadCaptureReply({
                text: `Request created ✅\n\nYour request ID is: ${String(
                  draft._id
                )}\n\nAn admin will contact you shortly in your Order Support Chat/inbox.`,
                requestId: String(draft._id),
                stepKey: "created",
              })
            );
          }
        }
      }

      // Start a new lead capture if user asks for an unlisted service
      const matchedServiceTitle = findMatchingServiceTitle(
        message,
        context?.services
      );
      const intent = isServiceRequestIntent(message);

      if (intent && !matchedServiceTitle) {
        const draft = await ServiceRequest.create({
          userId: req.user?.id || undefined,
          source: "jarvisx",
          status: "draft",
          rawMessage: message,
          requestedService: clampString(message, 200),
          platform: "",
          country: "",
          urgency: "",
          budget: undefined,
          budgetCurrency: "USD",
          captureStep: "platform",
          budgetProvided: false,
          createdFrom: {
            page,
            userAgent: clampString(req.headers["user-agent"], 240),
          },
          events: [
            {
              type: "draft_started",
              message: "Lead capture started",
              meta: { page },
            },
          ],
        });

        const firstQ = nextLeadQuestion(draft);
        return res.json(
          buildLeadCaptureReply({
            text: `Got it — we can help. I’ll create a request for the team.\n\n${firstQ.text}`,
            requestId: String(draft._id),
            stepKey: firstQ.key,
          })
        );
      }
    }

    const provider =
      String(process.env.JARVISX_PROVIDER || "openai").trim() || "openai";
    const apiKey = String(process.env.JARVISX_API_KEY || "").trim();
    const model =
      String(process.env.JARVISX_MODEL || "gpt-4o-mini").trim() ||
      "gpt-4o-mini";

    const wantsAi = toBool(apiKey);

    if (!wantsAi) {
      const out = fallbackAnswerFromContext({ message, context });
      return res.json(out);
    }

    const system = `You are JarvisX, the UREMO 24/7 support assistant.\n\nRules:\n- Only answer using the provided CONTEXT JSON.\n- If the answer is not clearly present in CONTEXT, reply exactly: \"I’m not sure. Please contact admin in Order Support Chat.\"\n- Keep replies short, direct, friendly.\n- Return STRICT JSON with keys: reply (string), confidence (0-1), usedSources (array of strings from [settings, services, paymentMethods, workPositions, rules]), suggestedActions (array of {label,url}).\n\nCONTEXT JSON:\n${JSON.stringify(
      context
    )}`;

    const user = `User message: ${message}\n\nMeta: page=${
      page || ""
    } orderId=${orderId || ""}`;

    const rawText = await callChatCompletion({
      provider,
      apiKey,
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const parsed = safeJsonParse(rawText);
    const normalized = normalizeAiResponse(parsed, message);

    // Final safety: if model didn't use any sources, do not pretend certainty.
    if (
      !normalized.usedSources.length &&
      normalized.reply !== buildNotSureReply().reply
    ) {
      return res.json(buildNotSureReply());
    }

    return res.json(normalized);
  } catch (err) {
    console.error(
      `[JARVISX_CHAT_FAIL] mode=${mode} errMessage=${err?.message}`
    );
    // Keep the system usable.
    return res.json(buildNotSureReply());
  }
};

// Exported for unit-like reuse in routes/controllers
exports._internal = {
  getPublicContextObject,
  getAdminContextObject,
  fallbackAnswerFromContext,
};
