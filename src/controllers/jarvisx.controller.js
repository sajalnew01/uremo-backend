const jwt = require("jsonwebtoken");
const SiteSettingsController = require("./siteSettings.controller");
const Service = require("../models/Service");
const PaymentMethod = require("../models/PaymentMethod");
const WorkPosition = require("../models/WorkPosition");
const mongoose = require("mongoose");
const ServiceRequest = require("../models/ServiceRequest");
const Order = require("../models/Order");
const OrderMessage = require("../models/OrderMessage");
const SiteSettings = require("../models/SiteSettings");
const JarvisChatEvent = require("../models/JarvisChatEvent");
const JarvisMemory = require("../models/JarvisMemory");
const { callJarvisLLM } = require("../services/jarvisxProviders");
const JarvisSession = require("../models/JarvisSession");
const crypto = require("crypto");

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

function getJarvisLlmStatus() {
  const provider =
    String(process.env.JARVISX_PROVIDER || "groq")
      .trim()
      .toLowerCase() || "groq";
  const apiKey =
    provider === "groq"
      ? String(process.env.GROQ_API_KEY || "").trim()
      : String(process.env.JARVISX_API_KEY || "").trim();
  const model =
    String(
      process.env.JARVISX_MODEL ||
        (provider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o-mini")
    )
      .trim()
      .toLowerCase() ||
    (provider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o-mini");
  return {
    configured: !!apiKey,
    provider,
    model,
  };
}

function toBool(v) {
  return !!v;
}

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyIntentDeterministic(text) {
  const msg = normalizeText(text);
  if (!msg) return "GENERAL_SUPPORT";

  if (/(interview|assessment|screening)/.test(msg))
    return "INTERVIEW_ASSESSMENT";
  if (/(apply|application|job|work position|work positions|hiring)/.test(msg))
    return "APPLY_TO_WORK";
  if (/(paid|payment|verify|verification|transaction|receipt|proof)/.test(msg))
    return "PAYMENT_HELP";
  if (/(delivery|when will|when do i get|timeframe|delivered|late)/.test(msg))
    return "ORDER_DELIVERY";
  if (/(buy|purchase|order|checkout)/.test(msg)) return "BUY_SERVICE";
  if (
    /(not available|custom|need service|looking for|can you build|can you make)/.test(
      msg
    )
  )
    return "CUSTOM_SERVICE";

  return "GENERAL_SUPPORT";
}

function isConfusedMessage(text) {
  const msg = normalizeText(text);
  return /(i don t understand|what do you mean|you don t get my point|confused|not clear)/.test(
    msg
  );
}

function platformQuickReplies() {
  return ["Outlier", "HFM", "TikTok", "Other"];
}

function urgencyQuickReplies() {
  return ["ASAP", "This week", "Flexible"];
}

function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  const raw = Array.isArray(xf) ? xf[0] : xf;
  const first = typeof raw === "string" ? raw.split(",")[0].trim() : "";
  const ip = first || req.ip || req.connection?.remoteAddress || "";
  return String(ip || "").trim();
}

function getSessionKey(req) {
  const userId = req.user?.id ? String(req.user.id) : "";
  if (userId) return `user:${userId}`;
  const ip = getClientIp(req);
  const hash = crypto
    .createHash("sha256")
    .update(String(ip || "unknown"))
    .digest("hex")
    .slice(0, 24);
  return `ip:${hash}`;
}

async function loadOrCreateSession(req) {
  const key = getSessionKey(req);
  const existing = await JarvisSession.findOne({ key });
  if (existing) return existing;
  return JarvisSession.create({ key });
}

async function pushSessionMessage(session, role, content) {
  session.lastMessages = Array.isArray(session.lastMessages)
    ? session.lastMessages
    : [];
  session.lastMessages.push({
    role,
    // Store minimal text only, last 10.
    content: clampString(String(content || ""), 300),
    at: new Date(),
  });
  if (session.lastMessages.length > 10) {
    session.lastMessages = session.lastMessages.slice(-10);
  }
}

function withBrainEnvelope(
  payload,
  { intent, quickReplies, didCreateRequest }
) {
  const out = {
    ...payload,
    intent: String(intent || "GENERAL_SUPPORT"),
  };
  if (Array.isArray(quickReplies) && quickReplies.length) {
    out.quickReplies = quickReplies.slice(0, 8);
  }
  if (typeof didCreateRequest === "boolean") {
    out.didCreateRequest = didCreateRequest;
  }
  return out;
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
    reply:
      "I’m not fully sure yet. Please open Order Support Chat or contact WhatsApp support.",
    confidence: 0.2,
    usedSources: [],
    suggestedActions: [],
  };
}

function isPriorityComplaint(message) {
  const msg = String(message || "").toLowerCase();
  if (!msg.trim()) return false;

  // Keep this intentionally simple/transparent (no AI needed).
  // Goal: bubble urgent issues into admin inbox for fast handling.
  const urgent = /(urgent|asap|immediately|right now|today)/.test(msg);
  const dispute =
    /(chargeback|refund|scam|fraud|stolen|report|lawsuit|police|paypal dispute|stripe dispute)/.test(
      msg
    );
  const angry = /(angry|unacceptable|terrible|worst|rip ?off|cheat)/.test(msg);
  const broken =
    /(not working|doesn\s*t work|no response|ignored|still waiting|delayed|late)/.test(
      msg
    );

  return urgent || dispute || angry || broken;
}

async function findEscalationOrderId({ explicitOrderId, userId }) {
  if (explicitOrderId && mongoose.Types.ObjectId.isValid(explicitOrderId)) {
    return explicitOrderId;
  }
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return null;

  const latest = await Order.findOne({ userId })
    .sort({ createdAt: -1 })
    .select("_id")
    .lean();
  return latest?._id ? String(latest._id) : null;
}

function normalizeTextForMatch(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeForSearch(text) {
  const msg = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!msg) return [];
  const tokens = msg
    .split(" ")
    .filter((t) => t.length >= 4)
    .slice(0, 8);
  return Array.from(new Set(tokens));
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getRelevantMemories(text, limit = 5) {
  const tokens = tokenizeForSearch(text);
  if (!tokens.length) return [];

  const or = tokens.map((t) => ({
    triggerText: { $regex: escapeRegex(t), $options: "i" },
  }));
  const tagOr = tokens.map((t) => ({ tags: t }));

  const items = await JarvisMemory.find({ $or: [...or, ...tagOr] })
    .sort({ confidence: -1, createdAt: -1 })
    .limit(Math.max(1, Math.min(10, limit)))
    .lean();

  return Array.isArray(items) ? items : [];
}

async function recordChatEvent({ mode, ok, usedAi, provider, model, page }) {
  try {
    await JarvisChatEvent.create({
      mode,
      ok: !!ok,
      usedAi: !!usedAi,
      provider: clampString(provider, 40),
      model: clampString(model, 60),
      page: clampString(page, 120),
    });
  } catch (err) {
    console.error(`[JARVISX_CHAT_EVENT_FAIL] errMessage=${err?.message}`);
  }
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

function fallbackAnswerFromContextAdmin(input) {
  const out = fallbackAnswerFromContext(input);
  const notSure = out?.reply === buildNotSureReply().reply;
  if (!notSure) return out;

  const llm = getJarvisLlmStatus();

  const services = Array.isArray(input?.context?.services)
    ? input.context.services
    : [];
  const paymentMethods = Array.isArray(input?.context?.paymentMethods)
    ? input.context.paymentMethods
    : [];
  const workPositions = Array.isArray(input?.context?.workPositions)
    ? input.context.workPositions
    : [];

  const topServices = services
    .slice(0, 6)
    .map((s) => String(s?.title || "").trim())
    .filter(Boolean);
  const topPayments = paymentMethods
    .slice(0, 6)
    .map((p) => String(p?.name || "").trim())
    .filter(Boolean);

  const lines = [
    `${
      llm.provider === "groq"
        ? "Groq not configured in ENV yet."
        : "LLM not configured."
    } I can still answer from CONTEXT.`,
    `Services: ${services.length}${
      topServices.length ? ` (e.g. ${topServices.join(", ")})` : ""
    }`,
    `Payment Methods: ${paymentMethods.length}${
      topPayments.length ? ` (e.g. ${topPayments.join(", ")})` : ""
    }`,
    `Work Positions: ${workPositions.length}`,
    `Ask about: services, pricing, payment instructions, work positions, site settings.`,
  ];

  return {
    reply: lines.join("\n"),
    confidence: 0.55,
    usedSources: ["settings", "services", "paymentMethods", "workPositions"],
    suggestedActions: [{ label: "Open Settings", url: "/admin/settings" }],
  };
}

function normalizeProviderName(provider) {
  const p = String(provider || "")
    .trim()
    .toLowerCase();
  if (!p) return "";
  if (p === "groq") return "groq";
  if (p === "openrouter") return "openrouter";
  if (p === "openai") return "openai";
  return p;
}

function resolveJarvisLlmConfig() {
  const provider = normalizeProviderName(
    process.env.JARVISX_PROVIDER || "groq"
  );

  const modelDefault =
    provider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o-mini";

  const model =
    String(process.env.JARVISX_MODEL || modelDefault).trim() || modelDefault;

  const temperatureRaw = Number(process.env.JARVISX_TEMPERATURE);
  const temperature = Number.isFinite(temperatureRaw)
    ? Math.max(0, Math.min(1, temperatureRaw))
    : 0.4;

  const maxTokensRaw = Number(process.env.JARVISX_MAX_TOKENS);
  const max_tokens = Number.isFinite(maxTokensRaw)
    ? Math.max(64, Math.min(4096, Math.floor(maxTokensRaw)))
    : 800;

  const apiKey =
    provider === "groq"
      ? String(process.env.GROQ_API_KEY || "").trim()
      : String(process.env.JARVISX_API_KEY || "").trim();

  const supported =
    provider === "groq" || provider === "openrouter" || provider === "openai";

  return { provider, supported, apiKey, model, temperature, max_tokens };
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

exports.requestService = async (req, res) => {
  try {
    tryAttachUser(req);

    const message = clampString(req.body?.message, 2000);
    const detectedServiceName = clampString(req.body?.detectedServiceName, 120);
    const page = clampString(req.body?.page, 120);

    if (!message) {
      return res.status(400).json({ message: "message is required" });
    }

    const doc = await ServiceRequest.create({
      userId: req.user?.id || undefined,
      source: "jarvisx",
      status: "new",
      rawMessage: message,
      requestedService: detectedServiceName || clampString(message, 200),
      captureStep: "",
      createdFrom: {
        page,
        userAgent: clampString(req.headers["user-agent"], 240),
      },
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

  const intent = classifyIntentDeterministic(message);

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

  let usedAi = false;
  let providerForLog = "";
  let modelForLog = "";

  // Lead capture state (client echoes this back to keep the flow going)
  const leadCaptureMeta =
    meta?.leadCapture && typeof meta.leadCapture === "object"
      ? meta.leadCapture
      : null;
  const pendingRequestId = clampString(leadCaptureMeta?.requestId, 64);

  try {
    const session = await loadOrCreateSession(req);
    session.lastIntent = intent;
    await pushSessionMessage(session, "user", message);

    if (isConfusedMessage(message)) {
      session.lastQuestionKey = "CLARIFY_MODE";
      const reply =
        "No worries. Just tell me 2 things:\n1) Which platform?\n2) How urgent is it?";
      await pushSessionMessage(session, "assistant", reply);
      await session.save();
      return res.json(
        withBrainEnvelope(
          {
            reply,
            confidence: 0.9,
            usedSources: ["rules"],
            suggestedActions: [],
            llm: getJarvisLlmStatus(),
          },
          {
            intent,
            quickReplies: [...platformQuickReplies(), ...urgencyQuickReplies()],
          }
        )
      );
    }

    const context =
      mode === "admin"
        ? await getAdminContextObject()
        : await getPublicContextObject();

    // Deterministic intent handling (no LLM needed)
    if (mode === "public" && intent === "INTERVIEW_ASSESSMENT") {
      session.lastQuestionKey = "ASK_PLATFORM";
      const reply =
        "Yes ✅ We can help with interview/screening assessments. Which platform is it for?";
      await pushSessionMessage(session, "assistant", reply);
      await session.save();
      return res.json(
        withBrainEnvelope(
          {
            reply,
            confidence: 0.92,
            usedSources: ["rules"],
            suggestedActions: [
              { label: "Browse Services", url: "/buy-service" },
            ],
            llm: getJarvisLlmStatus(),
          },
          { intent, quickReplies: ["Outlier", "HFM", "Other"] }
        )
      );
    }

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

            session.lastQuestionKey = "cancelled";
            await session.save();
            return res.json(
              withBrainEnvelope(
                buildLeadCaptureReply({
                  text: "No problem — I’ve cancelled that request. If you need anything else, just tell me.",
                  requestId: String(draft._id),
                  stepKey: "cancelled",
                }),
                { intent: "CUSTOM_SERVICE" }
              )
            );
          }

          const q = nextLeadQuestion(draft);
          if (q) {
            // Treat this message as answer to the current question
            const answer = clampString(message, 400);

            const lastQ = String(session.lastQuestionKey || "");
            const sameQuestion = lastQ && lastQ === q.key;

            if (q.key === "requestedService") {
              draft.requestedService = answer;
            } else if (q.key === "platform") {
              draft.platform = answer;
            } else if (q.key === "country") {
              draft.country = answer;
            } else if (q.key === "urgency") {
              const u = normalizeUrgencyFromAnswer(answer);
              if (u) draft.urgency = u;

              if (!u && sameQuestion) {
                const reply =
                  "Quick check — how urgent is it? Just tap one option.";
                session.lastQuestionKey = "urgency";
                await pushSessionMessage(session, "assistant", reply);
                await session.save();
                return res.json(
                  withBrainEnvelope(
                    buildLeadCaptureReply({
                      text: reply,
                      requestId: String(draft._id),
                      stepKey: q.key,
                    }),
                    {
                      intent: "CUSTOM_SERVICE",
                      quickReplies: urgencyQuickReplies(),
                    }
                  )
                );
              }
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

            session.lastQuestionKey = q.key;
            await session.save();

            const nextQ = nextLeadQuestion(draft);
            if (nextQ) {
              draft.captureStep = nextQ.key;
              await draft.save();
              session.lastQuestionKey = nextQ.key;
              await pushSessionMessage(session, "assistant", nextQ.text);
              await session.save();
              return res.json(
                withBrainEnvelope(
                  buildLeadCaptureReply({
                    text: nextQ.text,
                    requestId: String(draft._id),
                    stepKey: nextQ.key,
                  }),
                  {
                    intent: "CUSTOM_SERVICE",
                    quickReplies:
                      nextQ.key === "platform"
                        ? platformQuickReplies()
                        : nextQ.key === "urgency"
                        ? urgencyQuickReplies()
                        : undefined,
                  }
                )
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

            const reply = `Request created ✅\n\nYour request ID is: ${String(
              draft._id
            )}\n\nAn admin will contact you shortly in your Order Support Chat/inbox.`;
            await pushSessionMessage(session, "assistant", reply);
            session.lastQuestionKey = "created";
            await session.save();

            return res.json(
              withBrainEnvelope(
                buildLeadCaptureReply({
                  text: reply,
                  requestId: String(draft._id),
                  stepKey: "created",
                }),
                { intent: "CUSTOM_SERVICE", didCreateRequest: true }
              )
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

      // --- Priority complaints -> Admin Inbox (public mode) ---
      // If a user is upset / requesting refund / chargeback etc, escalate by creating
      // an OrderMessage so it appears in the existing admin inbox UI.
      if (isPriorityComplaint(message)) {
        const escalationOrderId = await findEscalationOrderId({
          explicitOrderId: orderId,
          userId: req.user?.id,
        });

        if (escalationOrderId) {
          try {
            await OrderMessage.create({
              orderId: escalationOrderId,
              senderRole: "user",
              senderId: req.user?.id || null,
              userId: req.user?.id || null,
              message: clampString(`[JarvisX Priority] ${message}`, 2000),
            });
          } catch (err) {
            console.error(
              `[JARVISX_PRIORITY_INBOX_FAIL] errMessage=${err?.message}`
            );
          }

          const reply =
            "Ive escalated this to an admin for fast review. Please keep an eye on your Order Support Chat for a response.";
          await recordChatEvent({
            mode,
            ok: true,
            usedAi: false,
            provider: "",
            model: "",
            page,
          });
          return res.json({
            reply,
            confidence: 0.95,
            usedSources: ["rules"],
            suggestedActions: [
              {
                label: "Open your order",
                url: `/orders/${String(escalationOrderId)}`,
              },
            ],
          });
        }

        // If we couldn't map this to an order, ask the user to open an order.
        await recordChatEvent({
          mode,
          ok: true,
          usedAi: false,
          provider: "",
          model: "",
          page,
        });
        return res.json({
          reply:
            "I can escalate this to an admin, but I need your order context. Please open your order and send this message from there, or tell me your order ID.",
          confidence: 0.85,
          usedSources: ["rules"],
          suggestedActions: [{ label: "Go to Orders", url: "/orders" }],
        });
      }

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
        session.lastQuestionKey = firstQ.key;
        await pushSessionMessage(session, "assistant", firstQ.text);
        await session.save();
        return res.json(
          withBrainEnvelope(
            buildLeadCaptureReply({
              text: `Got it — we can help. I’ll create a request for the team.\n\n${firstQ.text}`,
              requestId: String(draft._id),
              stepKey: firstQ.key,
            }),
            {
              intent: "CUSTOM_SERVICE",
              quickReplies:
                firstQ.key === "platform"
                  ? platformQuickReplies()
                  : firstQ.key === "urgency"
                  ? urgencyQuickReplies()
                  : undefined,
              didCreateRequest: true,
            }
          )
        );
      }
    }

    const llmConfig = resolveJarvisLlmConfig();
    const llm = getJarvisLlmStatus();

    const wantsAi = toBool(llmConfig.apiKey) && !!llmConfig.supported;
    usedAi = wantsAi;
    providerForLog = llmConfig.provider;
    modelForLog = llmConfig.model;

    if (!wantsAi) {
      const out =
        mode === "admin"
          ? fallbackAnswerFromContextAdmin({ message, context })
          : fallbackAnswerFromContext({ message, context });
      await recordChatEvent({
        mode,
        ok: true,
        usedAi,
        provider: providerForLog,
        model: modelForLog,
        page,
      });
      console.log(
        `[JARVISX_CHAT_OK] provider=${
          providerForLog || ""
        } mode=${mode} usedAi=false`
      );
      await session.save();
      return res.json(withBrainEnvelope({ ...out, llm }, { intent }));
    }

    const memories = await getRelevantMemories(message, 5);
    const memoryBlock = memories.length
      ? `\n\nMEMORIES (admin feedback about style/corrections):\n${memories
          .map(
            (m) =>
              `- [${String(m.source)}|c=${Number(m.confidence).toFixed(
                2
              )}] ${clampString(m.correctResponse, 240)}`
          )
          .join(
            "\n"
          )}\n\nIf any memory conflicts with CONTEXT JSON facts, follow CONTEXT.`
      : "";

    const system = `You are JarvisX Support — Sajal’s human assistant for UREMO.\n\nStrict style rules:\n- Speak like a real human support assistant (not like a chatbot).\n- Very short replies (1-4 lines).\n- Ask max 1 question.\n- Never repeat the same question twice.\n- Never mention API keys, system errors, stack traces, or provider issues in PUBLIC mode.\n\nAccuracy rules:\n- Use ONLY the provided CONTEXT JSON facts (services, payment methods, work positions, CMS/support texts, FAQ).\n- Do not hallucinate services, prices, or policies.\n\nDeterministic intent: ${intent}\n\nIf the user asks for a service that is NOT listed in CONTEXT.services:\n- Don’t just say “not available”.\n- Say we can still help if they share requirements.\n- Ask max 1 short question.\n- Say you’ll create a request for the admin/team.\n\nReturn STRICT JSON only, with keys:\n- reply (string)\n- confidence (0-1)\n- usedSources (array from [settings, services, paymentMethods, workPositions, rules])\n- suggestedActions (array of {label,url})\n\nCONTEXT JSON:\n${JSON.stringify(
      context
    )}${memoryBlock}`;

    const user = `User message: ${message}\n\nMeta: page=${
      page || ""
    } orderId=${orderId || ""}`;

    const llmResult = await callJarvisLLM({
      provider: llmConfig.provider,
      apiKey: llmConfig.apiKey,
      model: llmConfig.model,
      temperature: llmConfig.temperature,
      max_tokens: llmConfig.max_tokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    if (!llmResult.ok) {
      console.log(
        `[JARVISX_CHAT_FAIL] provider=${
          providerForLog || ""
        } mode=${mode} errorCode=${llmResult.error?.code || "UNKNOWN"}`
      );

      const out =
        mode === "admin"
          ? fallbackAnswerFromContextAdmin({ message, context })
          : fallbackAnswerFromContext({ message, context });

      await recordChatEvent({
        mode,
        ok: true,
        usedAi: false,
        provider: providerForLog,
        model: modelForLog,
        page,
      });

      await session.save();
      return res.json(withBrainEnvelope({ ...out, llm }, { intent }));
    }

    const rawText = llmResult.assistantText;

    const parsed = safeJsonParse(rawText);
    const normalized = normalizeAiResponse(parsed, message);

    // Final safety: if model didn't use any sources, do not pretend certainty.
    if (
      !normalized.usedSources.length &&
      normalized.reply !== buildNotSureReply().reply
    ) {
      await recordChatEvent({
        mode,
        ok: true,
        usedAi,
        provider: providerForLog,
        model: modelForLog,
        page,
      });
      if (mode === "admin") {
        const llm = getJarvisLlmStatus();
        const out = fallbackAnswerFromContextAdmin({ message, context });
        await session.save();
        return res.json(withBrainEnvelope({ ...out, llm }, { intent }));
      }
      await session.save();
      return res.json(
        withBrainEnvelope(
          { ...buildNotSureReply(), llm: getJarvisLlmStatus() },
          { intent }
        )
      );
    }

    await recordChatEvent({
      mode,
      ok: true,
      usedAi,
      provider: providerForLog,
      model: modelForLog,
      page,
    });
    console.log(
      `[JARVISX_CHAT_OK] provider=${
        providerForLog || ""
      } mode=${mode} usedAi=true`
    );
    await pushSessionMessage(session, "assistant", normalized.reply);
    await session.save();
    return res.json(
      withBrainEnvelope(
        { ...normalized, llm: getJarvisLlmStatus() },
        { intent }
      )
    );
  } catch (err) {
    console.error(
      `[JARVISX_CHAT_FAIL] mode=${mode} errMessage=${err?.message}`
    );
    console.log(
      `[JARVISX_CHAT_FAIL] provider=${
        providerForLog || ""
      } mode=${mode} error=exception`
    );
    await recordChatEvent({
      mode,
      ok: false,
      usedAi,
      provider: providerForLog,
      model: modelForLog,
      page,
    });
    // Keep the system usable.
    if (mode === "admin") {
      const context = await getAdminContextObject().catch(() => null);
      const out = fallbackAnswerFromContextAdmin({ message, context });
      return res.json(
        withBrainEnvelope({ ...out, llm: getJarvisLlmStatus() }, { intent })
      );
    }
    return res.json(
      withBrainEnvelope(
        { ...buildNotSureReply(), llm: getJarvisLlmStatus() },
        { intent }
      )
    );
  }
};

exports.healthReport = async (req, res) => {
  try {
    const llm = getJarvisLlmStatus();
    const [
      totalServices,
      activeServices,
      servicesMissingHero,
      totalWorkPositions,
      activeWorkPositions,
      totalServiceRequests,
      newServiceRequests,
      draftServiceRequests,
      pendingPaymentProof,
    ] = await Promise.all([
      Service.countDocuments({}),
      Service.countDocuments({ active: true }),
      Service.countDocuments({
        $or: [{ imageUrl: { $exists: false } }, { imageUrl: "" }],
      }),
      WorkPosition.countDocuments({}),
      WorkPosition.countDocuments({ active: true }),
      ServiceRequest.countDocuments({}),
      ServiceRequest.countDocuments({ status: "new" }),
      ServiceRequest.countDocuments({ status: "draft" }),
      Order.countDocuments({
        status: { $in: ["payment_submitted", "pending_review", "review"] },
        "payment.proofUrl": { $exists: true, $ne: "" },
        "payment.verifiedAt": { $in: [null, undefined] },
      }),
    ]);

    const settings = await SiteSettings.findOne({
      singletonKey: "main",
    }).lean();
    const missingSettings = [];
    const heroTitle = settings?.landing?.heroTitle || "";
    const heroSubtitle = settings?.landing?.heroSubtitle || "";
    const brandName = settings?.site?.brandName || "";
    const whatsapp = settings?.support?.whatsappNumber || "";
    const supportEmail = settings?.support?.supportEmail || "";
    if (!brandName) missingSettings.push("site.brandName");
    if (!heroTitle) missingSettings.push("landing.heroTitle");
    if (!heroSubtitle) missingSettings.push("landing.heroSubtitle");
    if (!whatsapp) missingSettings.push("support.whatsappNumber");
    if (!supportEmail) missingSettings.push("support.supportEmail");

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [chatTotal24h, chatOk24h] = await Promise.all([
      JarvisChatEvent.countDocuments({ createdAt: { $gte: since } }),
      JarvisChatEvent.countDocuments({ createdAt: { $gte: since }, ok: true }),
    ]);
    const chatErrorRate24h = chatTotal24h
      ? Number(((chatTotal24h - chatOk24h) / chatTotal24h).toFixed(4))
      : 0;

    res.set("Cache-Control", "no-store");
    return res.json({
      generatedAt: new Date().toISOString(),
      llm,
      services: {
        total: totalServices,
        active: activeServices,
        missingHeroCount: servicesMissingHero,
      },
      workPositions: {
        total: totalWorkPositions,
        active: activeWorkPositions,
      },
      serviceRequests: {
        total: totalServiceRequests,
        new: newServiceRequests,
        draft: draftServiceRequests,
      },
      orders: {
        paymentProofPendingCount: pendingPaymentProof,
      },
      settings: {
        missingKeys: missingSettings,
      },
      jarvisx: {
        chatTotal24h,
        chatOk24h,
        chatErrorRate24h,
      },
    });
  } catch (err) {
    console.error(`[JARVISX_HEALTH_REPORT_FAIL] errMessage=${err?.message}`);
    return res.status(500).json({ message: "Unable to build health report" });
  }
};

// Exported for unit-like reuse in routes/controllers
exports._internal = {
  getPublicContextObject,
  getAdminContextObject,
  fallbackAnswerFromContext,
};
