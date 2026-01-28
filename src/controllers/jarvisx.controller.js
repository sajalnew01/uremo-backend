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

// PATCH_36: Tool-based system imports
const { routeToTool, getQuickActions } = require("../jarvisx/intentRouter");
const { executeTool } = require("../jarvisx/tools");

// Brain upgrade imports
const {
  getSessionKey,
  loadOrCreateSession: loadSessionHelper,
  appendMessage,
  saveSession,
  updateCollected,
  wouldRepeatQuestion,
  getSessionSummary,
  clampString: clampStr,
  hasAsked,
  addAskedQuestion,
} = require("../utils/jarvisSession");
const {
  INTENTS,
  classifyIntent: classifyIntentUtil,
  isConfusedMessage: isConfusedUtil,
  wantsCancel: wantsCancelUtil,
  isGreeting,
  isAffirmative,
  isNegative,
  extractPlatform,
  extractUrgency,
  getQuickRepliesForIntent,
  getClarifyQuickReplies,
  platformQuickReplies: getPlatformReplies,
  urgencyQuickReplies: getUrgencyReplies,
} = require("../utils/jarvisIntent");

// P0 FIX: State machine imports
const {
  getQuickReplyRoute,
  isPureGreeting,
  getStepResponse,
  applyRouteToSession,
  advanceFlow,
  hasActiveFlow,
  resetFlow,
} = require("../utils/jarvisStateMachine");

const JARVISX_RULES = {
  manualVerification: true,
  proofAccepted: ["image", "pdf"],
  verificationTime: "5-60 minutes",
};

// PATCH_32: Enhanced system prompt with platform context
function buildEnhancedSystemPrompt(
  intent,
  context,
  memoryBlock,
  sessionBlock,
  session,
) {
  // Build conversation history for better context
  const recentMessages = Array.isArray(session?.messages)
    ? session.messages
        .slice(-6)
        .map((m) => `${m.role}: ${clampStr(m.content || "", 200)}`)
        .join("\n")
    : "";
  const historyBlock = recentMessages
    ? `\nRECENT CONVERSATION:\n${recentMessages}`
    : "";

  const platformContext = `PLATFORM OVERVIEW:
UREMO is a digital services marketplace offering:
1. Account verification/creation (Outlier, PayPal, Binance, Upwork, Fiverr)
2. Assessment/interview help (Outlier test prep, interview coaching)
3. Social media services (Instagram, TikTok, Facebook ads)
4. Microjob work opportunities
5. Affiliate program (earn commissions)

USER MOTIVES:
- "Buy service" = wants to purchase account/verification
- "Interview/assessment" = needs help with screening tests
- "Work" = wants to earn by working for us
- "Support" = has order/payment issues`;

  return `You are JarvisX Support — Sajal's human assistant for UREMO.

${platformContext}

STYLE RULES:
- Speak like a real human support (warm, helpful, not robotic)
- Short replies (1-4 lines max)
- Ask max 1 question per response
- Never repeat same question twice
- Never mention API keys/errors/technical issues in PUBLIC mode
- Use 1-2 emojis max

ACCURACY RULES:
- Use ONLY CONTEXT JSON facts
- Do not hallucinate prices or policies not in CONTEXT
- When unsure, ask clarifying questions

DETECTED INTENT: ${intent}${sessionBlock}${historyBlock}

IF SERVICE NOT IN CONTEXT.services:
- Dont say "not available"
- Offer to create custom request
- Ask 1 clarifying question
- Admin team will reach out

RETURN STRICT JSON with keys:
- reply (string)
- confidence (0-1)
- usedSources (array from [settings, services, paymentMethods, workPositions, rules])
- suggestedActions (array of {label,url})

CONTEXT JSON:
${JSON.stringify(context)}${memoryBlock}`;
}

function clampString(value, maxLen) {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!v) return "";
  return v.length <= maxLen ? v : v.slice(0, maxLen);
}

function getJarvisLlmStatus() {
  const provider = "groq";
  const apiKey = String(process.env.GROQ_API_KEY || "").trim();
  const model =
    String(process.env.JARVISX_MODEL || "llama-3.3-70b-versatile")
      .trim()
      .toLowerCase() || "llama-3.3-70b-versatile";
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

// Use the centralized classifier from jarvisIntent.js
function classifyIntentDeterministic(text) {
  return classifyIntentUtil(text);
}

// Use centralized confusion detector
function isConfusedMessage(text) {
  return isConfusedUtil(text);
}

// Quick reply helpers now from jarvisIntent.js
function platformQuickReplies() {
  return getPlatformReplies();
}

function urgencyQuickReplies() {
  return getUrgencyReplies();
}

function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  const raw = Array.isArray(xf) ? xf[0] : xf;
  const first = typeof raw === "string" ? raw.split(",")[0].trim() : "";
  const ip = first || req.ip || req.connection?.remoteAddress || "";
  return String(ip || "").trim();
}

// Use imported getSessionKey from jarvisSession.js

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
  { intent, quickReplies, didCreateRequest },
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
    }),
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

  if (!process.env.JWT_SECRET) return;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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

/**
 * P0 FIX: Build admin mode greeting/response - NO FALLBACK for normal queries
 * Only return greeting when message is ACTUALLY a greeting and no context exists
 */
function buildAdminGreeting(message, session = null) {
  const msg = normalizeText(message);

  // P0 FIX: If session has active flow, NEVER return greeting
  if (session && hasActiveFlow(session)) {
    return null;
  }

  // P0 FIX: Handle "who am i" - Admin identity question
  if (/who\s*(am\s*i|is\s*this|are\s*you\s*talking\s*to)/i.test(msg)) {
    return {
      reply:
        "You are the admin (Sajal). You control all UREMO operations, services, and user management.",
      confidence: 0.98,
      usedSources: ["rules"],
      suggestedActions: [
        { label: "Dashboard", url: "/admin" },
        { label: "Services", url: "/admin/services" },
      ],
      quickReplies: ["Check orders", "Add service", "System health"],
    };
  }

  // P0 FIX: Handle other admin identity/status questions
  if (/what\s*(can\s*you|do\s*you)\s*(do|handle|help)/i.test(msg)) {
    return {
      reply:
        "Boss, I can help you manage services, check orders, review payments, handle support requests, and more. What should I tackle?",
      confidence: 0.95,
      usedSources: ["rules"],
      suggestedActions: [
        { label: "Services", url: "/admin/services" },
        { label: "Orders", url: "/admin/orders" },
      ],
      quickReplies: [
        "Check orders",
        "Add service",
        "Support status",
        "System health",
      ],
    };
  }

  // Only greet on ACTUAL greeting messages (not normal questions)
  if (!msg || /^(hi|hello|hey|test|yo|sup|sleeping|awake|there)$/.test(msg)) {
    return {
      reply: "Yes boss ✅ I'm here. What do you need me to handle?",
      confidence: 0.95,
      usedSources: ["rules"],
      suggestedActions: [
        { label: "Check Orders", url: "/admin/orders" },
        { label: "Add Service", url: "/admin/services" },
        { label: "Support Queue", url: "/admin/support" },
      ],
      quickReplies: [
        "Check orders",
        "Add service",
        "Support status",
        "System health",
      ],
    };
  }

  // P0 FIX: Return null for normal questions - let the LLM handle them
  return null;
}
/**
 * P0 FIX: Build public mode greeting/response - NEVER reset if flow exists
 * Only return greeting when:
 * 1. Message is a pure greeting (hi/hello)
 * 2. Session has NO active flow
 */
function buildPublicGreeting(message, session = null) {
  const msg = normalizeText(message);

  // P0 FIX: If session has active flow, NEVER return greeting (prevents reset bug)
  if (session && hasActiveFlow(session)) {
    return null;
  }

  // Only greet on ACTUAL greeting messages with NO context
  if (!msg || /^(hi|hello|hey|yo|sup)$/.test(msg)) {
    return {
      reply: "Hi 👋 I'm JarvisX Support. How can I help you today?",
      confidence: 0.95,
      usedSources: ["rules"],
      suggestedActions: [
        { label: "Browse Services", url: "/buy-service" },
        { label: "Check Orders", url: "/orders" },
      ],
      quickReplies: [
        "Buy service",
        "Order status",
        "Interview help",
        "Custom request",
      ],
    };
  }
  return null;
}
/**
 * Build intelligent fallback - NEVER say "contact admin" or "not sure"
 */
function buildSmartFallback(isAdmin, intent) {
  if (isAdmin) {
    return {
      reply:
        "I can help with that. Could you give me a bit more detail about what you need?",
      confidence: 0.7,
      usedSources: ["rules"],
      suggestedActions: [{ label: "Dashboard", url: "/admin" }],
      quickReplies: [
        "Check orders",
        "Add service",
        "View analytics",
        "Support queue",
      ],
    };
  }
  const intentReplies = {
    INTERVIEW_ASSESSMENT:
      "I can help with interview/assessment support. Which platform is this for?",
    BUY_SERVICE:
      "I can help you find the right service. What are you looking for?",
    CUSTOM_SERVICE:
      "We can handle custom requests! Tell me what service you need.",
    ORDER_DELIVERY: "Let me help with your order. Do you have an order ID?",
    PAYMENT_HELP:
      "I can assist with payment questions. What do you need help with?",
  };
  return {
    reply:
      intentReplies[intent] ||
      "How can I help you today? You can ask about our services, check order status, or request custom support.",
    confidence: 0.75,
    usedSources: ["rules"],
    suggestedActions: [{ label: "Browse Services", url: "/buy-service" }],
    quickReplies: [
      "Buy service",
      "Order status",
      "Interview help",
      "Payment help",
    ],
  };
}
// Backwards compatible - delegates to buildSmartFallback
function buildNotSureReply(isAdmin = false, intent = null) {
  return buildSmartFallback(isAdmin, intent);
}

function isPriorityComplaint(message) {
  const msg = String(message || "").toLowerCase();
  if (!msg.trim()) return false;

  // Keep this intentionally simple/transparent (no AI needed).
  // Goal: bubble urgent issues into admin inbox for fast handling.
  const urgent = /(urgent|asap|immediately|right now|today)/.test(msg);
  const dispute =
    /(chargeback|refund|scam|fraud|stolen|report|lawsuit|police|paypal dispute|stripe dispute)/.test(
      msg,
    );
  const angry = /(angry|unacceptable|terrible|worst|rip ?off|cheat)/.test(msg);
  const broken =
    /(not working|doesn\s*t work|no response|ignored|still waiting|delayed|late)/.test(
      msg,
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
      msg,
    ) &&
    /(service|account|kyc|verification|outlier|paypal|binance|stripe|payment|ads|instagram|tiktok|facebook|google|shopify|amazon|upwork|fiverr)/.test(
      msg,
    )
  );
}

// Use centralized wantsCancel from jarvisIntent.js
function wantsCancel(message) {
  return wantsCancelUtil(message);
}

function parseBudget(message) {
  const msg = String(message || "").toLowerCase();
  const m = msg.match(
    /(\$|usd|eur|ngn|gbp)?\s*([0-9]{2,7})(?:\s*(\$|usd|eur|ngn|gbp))?/i,
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

  return buildNotSureReply(false, null);
}

function fallbackAnswerFromContextAdmin(input) {
  const out = fallbackAnswerFromContext(input);
  // Check if it's a generic fallback response
  const isGenericFallback =
    out?.confidence <= 0.75 && !out?.usedSources?.length;
  if (!isGenericFallback) return out;

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
  // Lockdown: Groq-only
  return "groq";
}

function resolveJarvisLlmConfig() {
  const provider = "groq";

  const modelDefault = "llama-3.3-70b-versatile";
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

  const apiKey = String(process.env.GROQ_API_KEY || "").trim();
  const supported = true;

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

function normalizeAiResponse(
  raw,
  inputMessage,
  isAdmin = false,
  intent = null,
) {
  const fallback = buildNotSureReply(isAdmin, intent);
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
  const sessionKey = getSessionKey(req);

  if (!message) {
    return res.status(400).json({ message: "Message is required" });
  }

  // P0 FIX: Set session cookie for anonymous users
  if (req._jarvisxNewSid) {
    res.cookie("jarvisx_sid", req._jarvisxNewSid, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 60 * 1000, // 30 minutes
    });
  }

  // Load session FIRST to check flow state
  let session;
  try {
    session = await loadSessionHelper(req);
  } catch (err) {
    console.error(`[JARVISX_SESSION_FAIL] err=${err?.message}`);
    session = { flow: null, step: null, collectedData: {}, askedQuestions: [] };
  }

  // P0 FIX: Check for quick reply routing BEFORE anything else
  const quickReplyRoute = getQuickReplyRoute(message);
  if (quickReplyRoute) {
    applyRouteToSession(session, quickReplyRoute);

    // If quick reply has escalate flag, handle differently
    if (quickReplyRoute.escalate) {
      const reply =
        mode === "admin"
          ? "You're already talking to the admin system. What do you need?"
          : "I'll connect you with an admin. Please describe your issue or open your order to chat directly.";

      appendMessage(session, "user", message);
      appendMessage(session, "assistant", reply);
      await saveSession(session);

      return res.json(
        withBrainEnvelope(
          {
            reply,
            confidence: 0.9,
            usedSources: ["rules"],
            suggestedActions: [{ label: "My Orders", url: "/orders" }],
            llm: getJarvisLlmStatus(),
          },
          { intent: "ESCALATE" },
        ),
      );
    }

    // Get step-based response for the new flow
    const stepResponse = getStepResponse(session.flow, session.step, session);
    if (stepResponse) {
      appendMessage(session, "user", message);
      appendMessage(session, "assistant", stepResponse.reply);
      await saveSession(session);

      console.log(
        `[JARVISX_CHAT_OK] key=${sessionKey.slice(0, 12)}... flow=${
          session.flow
        } step=${session.step} mode=quick_reply_route`,
      );

      return res.json(
        withBrainEnvelope(
          {
            reply: stepResponse.reply,
            confidence: 0.95,
            usedSources: ["rules"],
            suggestedActions: stepResponse.suggestedActions || [],
            llm: getJarvisLlmStatus(),
          },
          {
            intent: session.flow || intent,
            quickReplies: stepResponse.quickReplies || [],
          },
        ),
      );
    }
  }

  // P0 FIX: If session has active flow, handle state machine continuation
  if (hasActiveFlow(session)) {
    // Extract data from user's answer
    const detectedPlatform = extractPlatform(message);
    const detectedUrgency = extractUrgency(message);

    if (detectedPlatform) {
      if (!session.collectedData) session.collectedData = {};
      session.collectedData.platform = detectedPlatform;
    }
    if (detectedUrgency) {
      if (!session.collectedData) session.collectedData = {};
      session.collectedData.urgency = detectedUrgency;
    }

    // Check if user wants to cancel
    if (wantsCancelUtil(message)) {
      resetFlow(session);
      appendMessage(session, "user", message);
      const reply = "No problem, I've cancelled that. How else can I help?";
      appendMessage(session, "assistant", reply);
      await saveSession(session);

      return res.json(
        withBrainEnvelope(
          {
            reply,
            confidence: 0.95,
            usedSources: ["rules"],
            suggestedActions: [
              { label: "Browse Services", url: "/buy-service" },
            ],
            llm: getJarvisLlmStatus(),
          },
          {
            intent: "CANCELLED",
            quickReplies: ["Buy service", "Order status", "Interview help"],
          },
        ),
      );
    }

    // Advance to next step
    const { nextStep, complete } = advanceFlow(session, message);
    if (nextStep) {
      session.step = nextStep;
    }

    if (complete) {
      // Flow complete - provide final response
      const collected = session.collectedData || {};
      const reply = `Perfect! For ${collected.serviceType || "your"} ${
        collected.platform || ""
      } service with ${
        collected.urgency || "flexible"
      } urgency — check our services or an admin will reach out soon.`;

      appendMessage(session, "user", message);
      appendMessage(session, "assistant", reply);
      session.step = "COMPLETE";
      await saveSession(session);

      console.log(
        `[JARVISX_CHAT_OK] key=${sessionKey.slice(0, 12)}... flow=${
          session.flow
        } step=COMPLETE mode=flow_complete`,
      );

      return res.json(
        withBrainEnvelope(
          {
            reply,
            confidence: 0.95,
            usedSources: ["rules", "services"],
            suggestedActions: [
              { label: "Browse Services", url: "/buy-service" },
            ],
            llm: getJarvisLlmStatus(),
          },
          { intent: session.flow || intent },
        ),
      );
    }

    // Get response for next step
    const stepResponse = getStepResponse(session.flow, session.step, session);
    if (stepResponse) {
      appendMessage(session, "user", message);
      appendMessage(session, "assistant", stepResponse.reply);
      await saveSession(session);

      console.log(
        `[JARVISX_CHAT_OK] key=${sessionKey.slice(0, 12)}... flow=${
          session.flow
        } step=${session.step} mode=flow_continue`,
      );

      return res.json(
        withBrainEnvelope(
          {
            reply: stepResponse.reply,
            confidence: 0.92,
            usedSources: ["rules"],
            suggestedActions: stepResponse.suggestedActions || [],
            llm: getJarvisLlmStatus(),
          },
          {
            intent: session.flow || intent,
            quickReplies: stepResponse.quickReplies || [],
          },
        ),
      );
    }
  }

  // PATCH_36: Tool-based system routing - PRIORITY before deterministic intents
  const toolContext = {
    userId: req.user?.id || null,
    userRole: req.user?.role || "guest",
    isAdmin: isAdminUser(req),
  };

  const toolRoute = routeToTool(message, toolContext);

  if (toolRoute && toolRoute.tool) {
    try {
      const toolResult = await executeTool(
        toolRoute.tool,
        toolRoute.params || {},
        toolContext,
      );

      if (toolResult.success) {
        // Format tool result into human-readable reply
        let reply = toolResult.message || "Done!";

        // Add data summary if present
        if (toolResult.data) {
          if (Array.isArray(toolResult.data) && toolResult.data.length > 0) {
            // Format array data as bullet list
            const items = toolResult.data.slice(0, 5).map((item) => {
              if (item.service && item.status) {
                return `• ${item.service} - ${item.status}`;
              }
              if (item.title && item.price !== undefined) {
                return `• ${item.title} - $${item.price}`;
              }
              if (item.ticketNumber) {
                return `• ${item.ticketNumber}: ${item.subject || "No subject"}`;
              }
              return `• ${JSON.stringify(item).slice(0, 100)}`;
            });
            if (items.length > 0) {
              reply += "\n\n" + items.join("\n");
            }
            if (toolResult.data.length > 5) {
              reply += `\n... and ${toolResult.data.length - 5} more`;
            }
          } else if (typeof toolResult.data === "object") {
            // Format object data as key-value
            const { walletBalance, affiliateBalance, totalBalance } =
              toolResult.data;
            if (walletBalance !== undefined) {
              reply = `💰 Wallet: $${walletBalance.toFixed(2)}\n💎 Affiliate: $${(affiliateBalance || 0).toFixed(2)}\n📊 Total: $${(totalBalance || 0).toFixed(2)}`;
            }
          }
        }

        // Build suggested actions
        const suggestedActions = [];
        if (toolResult.action?.url) {
          suggestedActions.push({
            label:
              toolResult.action.type === "order_updated"
                ? "View Order"
                : "View Details",
            url: toolResult.action.url,
          });
        }

        // Only save session if it's a valid Mongoose document
        if (session && typeof session.save === "function") {
          appendMessage(session, "user", message);
          appendMessage(session, "assistant", reply);
          await saveSession(session);
        }

        console.log(
          `[JARVISX_CHAT_OK] key=${sessionKey.slice(0, 12)}... tool=${toolRoute.tool} mode=tool_execution`,
        );

        return res.json(
          withBrainEnvelope(
            {
              reply,
              confidence: toolRoute.confidence || 0.9,
              usedSources: ["tools", "database"],
              suggestedActions,
              llm: getJarvisLlmStatus(),
              toolUsed: toolRoute.tool,
            },
            {
              intent: `TOOL_${toolRoute.tool.toUpperCase()}`,
              quickReplies: getQuickActions(toolContext).map((a) => a.label),
            },
          ),
        );
      } else if (toolResult.code === "AUTH_REQUIRED") {
        // User needs to log in
        const reply = "Please log in to access this feature.";
        appendMessage(session, "user", message);
        appendMessage(session, "assistant", reply);
        await saveSession(session);

        return res.json(
          withBrainEnvelope(
            {
              reply,
              confidence: 0.95,
              usedSources: ["rules"],
              suggestedActions: [{ label: "Log In", url: "/login" }],
              llm: getJarvisLlmStatus(),
            },
            { intent: "AUTH_REQUIRED" },
          ),
        );
      }
      // Tool execution failed - fall through to normal handlers
    } catch (toolErr) {
      console.error(
        `[JARVISX_TOOL_ERROR] tool=${toolRoute.tool} err=${toolErr?.message}`,
      );
      // Fall through to normal handlers on tool error
    }
  }

  if (mode === "admin") {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!isAdminUser(req)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    // P0 FIX: Check for admin greeting/test message - pass session to check flow
    const adminGreeting = buildAdminGreeting(message, session);
    if (adminGreeting) {
      appendMessage(session, "user", message);
      appendMessage(session, "assistant", adminGreeting.reply);
      await saveSession(session);

      console.log(
        `[JARVISX_CHAT_OK] key=${sessionKey.slice(
          0,
          12,
        )}... intent=GREETING mode=admin_greeting`,
      );
      return res.json(
        withBrainEnvelope(
          { ...adminGreeting, llm: getJarvisLlmStatus() },
          { intent: "GREETING", quickReplies: adminGreeting.quickReplies },
        ),
      );
    }
  } else {
    // P0 FIX: Public mode greeting check - pass session to check flow
    const publicGreeting = buildPublicGreeting(message, session);
    if (publicGreeting) {
      appendMessage(session, "user", message);
      appendMessage(session, "assistant", publicGreeting.reply);
      await saveSession(session);

      console.log(
        `[JARVISX_CHAT_OK] key=${sessionKey.slice(
          0,
          12,
        )}... intent=GREETING mode=public_greeting`,
      );
      return res.json(
        withBrainEnvelope(
          { ...publicGreeting, llm: getJarvisLlmStatus() },
          { intent: "GREETING", quickReplies: publicGreeting.quickReplies },
        ),
      );
    }
  }

  const meta =
    req.body?.meta && typeof req.body.meta === "object" ? req.body.meta : {};
  const orderId = clampString(meta.orderId, 64);
  const page = clampString(meta.page, 120);

  let usedAi = false;
  let providerForLog = "";
  let modelForLog = "";
  let replyMode = "normal"; // normal | clarify | anti-loop

  // Lead capture state (client echoes this back to keep the flow going)
  const leadCaptureMeta =
    meta?.leadCapture && typeof meta.leadCapture === "object"
      ? meta.leadCapture
      : null;
  const pendingRequestId = clampString(leadCaptureMeta?.requestId, 64);

  try {
    // P0 FIX: Session already loaded above, reuse it (don't load again)
    // Extract any platform/urgency from user message for session memory
    const detectedPlatform = extractPlatform(message);
    const detectedUrgency = extractUrgency(message);
    if (detectedPlatform)
      updateCollected(session, "platform", detectedPlatform);
    if (detectedUrgency) updateCollected(session, "urgency", detectedUrgency);

    session.lastIntent = intent;
    appendMessage(session, "user", message);

    // --- ANTI-LOOP: Clarify mode when user is confused ---
    if (isConfusedMessage(message)) {
      replyMode = "clarify";
      session.lastQuestionKey = "CLARIFY_MODE";
      const reply = "No worries! Let me help you. What do you need help with?";
      appendMessage(session, "assistant", reply);
      await saveSession(session);

      console.log(
        `[JARVISX_CHAT_OK] key=${sessionKey.slice(
          0,
          12,
        )}... intent=${intent} provider=none mode=${replyMode}`,
      );

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
            quickReplies: getClarifyQuickReplies(),
          },
        ),
      );
    }

    const context =
      mode === "admin"
        ? await getAdminContextObject()
        : await getPublicContextObject();

    // Deterministic intent handling (no LLM needed)
    // INTERVIEW_ASSESSMENT intent handling with anti-loop
    if (mode === "public" && intent === "INTERVIEW_ASSESSMENT") {
      // Check if we already have platform collected
      const hasPlatform = !!session.collected?.platform;
      const hasUrgency = !!session.collected?.urgency;

      // Anti-loop: don't ask platform again if already asked in this session
      const alreadyAskedPlatform = hasAsked(session, "ASK_PLATFORM");

      if (!hasPlatform && !alreadyAskedPlatform) {
        addAskedQuestion(session, "ASK_PLATFORM");
        session.lastQuestionKey = "ASK_PLATFORM";
        const reply =
          "Yes ✅ We can help with interview/screening assessments. Which platform is it for?";
        appendMessage(session, "assistant", reply);
        await saveSession(session);

        console.log(
          `[JARVISX_CHAT_OK] key=${sessionKey.slice(
            0,
            12,
          )}... intent=${intent} provider=none mode=deterministic`,
        );

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
            { intent, quickReplies: platformQuickReplies() },
          ),
        );
      } else if (
        hasPlatform &&
        !hasUrgency &&
        !hasAsked(session, "ASK_URGENCY")
      ) {
        // Have platform, ask urgency
        addAskedQuestion(session, "ASK_URGENCY");
        session.lastQuestionKey = "ASK_URGENCY";
        const reply = `Got it, ${session.collected.platform}. How urgent is this?`;
        appendMessage(session, "assistant", reply);
        await saveSession(session);

        console.log(
          `[JARVISX_CHAT_OK] key=${sessionKey.slice(
            0,
            12,
          )}... intent=${intent} provider=none mode=deterministic`,
        );

        return res.json(
          withBrainEnvelope(
            {
              reply,
              confidence: 0.9,
              usedSources: ["rules"],
              suggestedActions: [
                { label: "Browse Services", url: "/buy-service" },
              ],
              llm: getJarvisLlmStatus(),
            },
            { intent, quickReplies: urgencyQuickReplies() },
          ),
        );
      } else if (hasPlatform && hasUrgency) {
        // Both collected, confirm and guide to services
        const reply = `Perfect! For ${session.collected.platform} assessment help with ${session.collected.urgency} urgency — check our services or an admin will reach out soon.`;
        appendMessage(session, "assistant", reply);
        session.lastQuestionKey = "COMPLETE";
        await saveSession(session);

        console.log(
          `[JARVISX_CHAT_OK] key=${sessionKey.slice(
            0,
            12,
          )}... intent=${intent} provider=none mode=deterministic`,
        );

        return res.json(
          withBrainEnvelope(
            {
              reply,
              confidence: 0.95,
              usedSources: ["rules", "services"],
              suggestedActions: [
                { label: "Browse Services", url: "/buy-service" },
              ],
              llm: getJarvisLlmStatus(),
            },
            { intent },
          ),
        );
      } else {
        // Anti-loop fallback: we asked platform but user didn't provide it
        // Don't repeat, offer alternative
        replyMode = "anti-loop";
        const reply =
          "No problem! You can browse our services directly or tap an option below.";
        appendMessage(session, "assistant", reply);
        session.lastQuestionKey = "ANTI_LOOP_FALLBACK";
        await saveSession(session);

        console.log(
          `[JARVISX_CHAT_OK] key=${sessionKey.slice(
            0,
            12,
          )}... intent=${intent} provider=none mode=${replyMode}`,
        );

        return res.json(
          withBrainEnvelope(
            {
              reply,
              confidence: 0.8,
              usedSources: ["rules"],
              suggestedActions: [
                { label: "Browse Services", url: "/buy-service" },
              ],
              llm: getJarvisLlmStatus(),
            },
            {
              intent,
              quickReplies: [...platformQuickReplies(), "Browse Services"],
            },
          ),
        );
      }
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
            await saveSession(session);

            console.log(
              `[JARVISX_CHAT_OK] key=${sessionKey.slice(
                0,
                12,
              )}... intent=CUSTOM_SERVICE provider=none mode=cancelled`,
            );

            return res.json(
              withBrainEnvelope(
                buildLeadCaptureReply({
                  text: "No problem — I’ve cancelled that request. If you need anything else, just tell me.",
                  requestId: String(draft._id),
                  stepKey: "cancelled",
                }),
                { intent: "CUSTOM_SERVICE" },
              ),
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
              // Extract platform intelligently
              const platformAnswer = extractPlatform(answer) || answer;
              draft.platform = platformAnswer;
              updateCollected(session, "platform", platformAnswer);
            } else if (q.key === "country") {
              draft.country = answer;
            } else if (q.key === "urgency") {
              const u = normalizeUrgencyFromAnswer(answer);
              if (u) {
                draft.urgency = u;
                updateCollected(session, "urgency", u);
              }

              // ANTI-LOOP: Don't repeat urgency question twice
              if (!u && sameQuestion) {
                replyMode = "anti-loop";
                const reply =
                  "No worries! Just tap an option below, or type 'flexible' if not urgent.";
                session.lastQuestionKey = "urgency_antiloop";
                appendMessage(session, "assistant", reply);
                await saveSession(session);

                console.log(
                  `[JARVISX_CHAT_OK] key=${sessionKey.slice(
                    0,
                    12,
                  )}... intent=CUSTOM_SERVICE provider=none mode=${replyMode}`,
                );

                return res.json(
                  withBrainEnvelope(
                    buildLeadCaptureReply({
                      text: reply,
                      requestId: String(draft._id),
                      stepKey: q.key,
                    }),
                    {
                      intent: "CUSTOM_SERVICE",
                      quickReplies: [...urgencyQuickReplies(), "Skip"],
                    },
                  ),
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
            await saveSession(session);

            const nextQ = nextLeadQuestion(draft);
            if (nextQ) {
              draft.captureStep = nextQ.key;
              await draft.save();
              session.lastQuestionKey = nextQ.key;
              appendMessage(session, "assistant", nextQ.text);
              await saveSession(session);

              console.log(
                `[JARVISX_CHAT_OK] key=${sessionKey.slice(
                  0,
                  12,
                )}... intent=CUSTOM_SERVICE provider=none mode=lead_capture`,
              );

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
                  },
                ),
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
              draft._id,
            )}\n\nAn admin will contact you shortly in your Order Support Chat/inbox.`;
            appendMessage(session, "assistant", reply);
            session.lastQuestionKey = "created";
            await saveSession(session);

            console.log(
              `[JARVISX_CHAT_OK] key=${sessionKey.slice(
                0,
                12,
              )}... intent=CUSTOM_SERVICE provider=none mode=lead_created`,
            );

            return res.json(
              withBrainEnvelope(
                buildLeadCaptureReply({
                  text: reply,
                  requestId: String(draft._id),
                  stepKey: "created",
                }),
                { intent: "CUSTOM_SERVICE", didCreateRequest: true },
              ),
            );
          }
        }
      }

      // Start a new lead capture if user asks for an unlisted service
      const matchedServiceTitle = findMatchingServiceTitle(
        message,
        context?.services,
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
              `[JARVISX_PRIORITY_INBOX_FAIL] errMessage=${err?.message}`,
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
        appendMessage(session, "assistant", firstQ.text);
        await saveSession(session);

        console.log(
          `[JARVISX_CHAT_OK] key=${sessionKey.slice(
            0,
            12,
          )}... intent=CUSTOM_SERVICE provider=none mode=new_lead`,
        );

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
            },
          ),
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
        `[JARVISX_CHAT_OK] key=${sessionKey.slice(
          0,
          12,
        )}... intent=${intent} provider=${
          providerForLog || "none"
        } mode=${mode}`,
      );
      await saveSession(session);
      return res.json(withBrainEnvelope({ ...out, llm }, { intent }));
    }

    const memories = await getRelevantMemories(message, 5);
    const memoryBlock = memories.length
      ? `\n\nMEMORIES (admin feedback about style/corrections):\n${memories
          .map(
            (m) =>
              `- [${String(m.source)}|c=${Number(m.confidence).toFixed(
                2,
              )}] ${clampString(m.correctResponse, 240)}`,
          )
          .join(
            "\n",
          )}\n\nIf any memory conflicts with CONTEXT JSON facts, follow CONTEXT.`
      : "";

    // Build session context for LLM (what we already collected)
    const sessionContext = session.collected || session.collectedData || {};
    const sessionHints = [];
    if (sessionContext.platform)
      sessionHints.push(`Platform: ${sessionContext.platform}`);
    if (sessionContext.urgency)
      sessionHints.push(`Urgency: ${sessionContext.urgency}`);
    if (sessionContext.serviceType)
      sessionHints.push(`Service: ${sessionContext.serviceType}`);
    const sessionBlock = sessionHints.length
      ? `\nSESSION DATA: ${sessionHints.join(", ")}`
      : "";

    const system = `You are JarvisX Support — Sajal’s human assistant for UREMO.\n\nStrict style rules:\n- Speak like a real human support assistant (not like a chatbot).\n- Very short replies (1-4 lines).\n- Ask max 1 question.\n- Never repeat the same question twice.\n- Never mention API keys, system errors, stack traces, or provider issues in PUBLIC mode.\n\nAccuracy rules:\n- Use ONLY the provided CONTEXT JSON facts (services, payment methods, work positions, CMS/support texts, FAQ).\n- Do not hallucinate services, prices, or policies.\n\nDeterministic intent: ${intent}\n\nIf the user asks for a service that is NOT listed in CONTEXT.services:\n- Don’t just say “not available”.\n- Say we can still help if they share requirements.\n- Ask max 1 short question.\n- Say you’ll create a request for the admin/team.\n\nReturn STRICT JSON only, with keys:\n- reply (string)\n- confidence (0-1)\n- usedSources (array from [settings, services, paymentMethods, workPositions, rules])\n- suggestedActions (array of {label,url})\n\nCONTEXT JSON:\n${JSON.stringify(
      context,
    )}${memoryBlock}${sessionBlock}`;

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
        } mode=${mode} errorCode=${llmResult.error?.code || "UNKNOWN"}`,
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

      console.log(
        `[JARVISX_CHAT_OK] key=${sessionKey.slice(
          0,
          12,
        )}... intent=${intent} provider=${
          providerForLog || "none"
        } mode=llm_fallback`,
      );

      await saveSession(session);
      return res.json(withBrainEnvelope({ ...out, llm }, { intent }));
    }

    const rawText = llmResult.assistantText;

    const parsed = safeJsonParse(rawText);
    const isAdmin = mode === "admin";
    const normalized = normalizeAiResponse(parsed, message, isAdmin, intent);

    // Final safety: if model didn't use any sources, do not pretend certainty.
    if (
      !normalized.usedSources.length &&
      normalized.reply !== buildNotSureReply(isAdmin, intent).reply
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
        await saveSession(session);
        return res.json(withBrainEnvelope({ ...out, llm }, { intent }));
      }
      await saveSession(session);
      return res.json(
        withBrainEnvelope(
          { ...buildNotSureReply(false, intent), llm: getJarvisLlmStatus() },
          { intent },
        ),
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
      `[JARVISX_CHAT_OK] key=${sessionKey.slice(
        0,
        12,
      )}... intent=${intent} provider=${
        providerForLog || "none"
      } mode=llm_success`,
    );
    appendMessage(session, "assistant", normalized.reply);
    await saveSession(session);
    return res.json(
      withBrainEnvelope(
        { ...normalized, llm: getJarvisLlmStatus() },
        { intent },
      ),
    );
  } catch (err) {
    console.error(
      `[JARVISX_CHAT_FAIL] key=${
        sessionKey?.slice(0, 12) || "unknown"
      }... err=${err?.message}`,
    );
    console.log(
      `[JARVISX_CHAT_FAIL] key=${
        sessionKey?.slice(0, 12) || "unknown"
      }... intent=${intent} provider=${providerForLog || "none"} mode=exception`,
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
        withBrainEnvelope({ ...out, llm: getJarvisLlmStatus() }, { intent }),
      );
    }
    return res.json(
      withBrainEnvelope(
        { ...buildNotSureReply(false, intent), llm: getJarvisLlmStatus() },
        { intent },
      ),
    );
  }
};

/**
 * Stable health report contract - ALWAYS returns full shape even on error.
 * Frontend depends on this contract being stable.
 */
function buildSafeHealthResponse(data = {}) {
  const llm = data.llm ?? { configured: false, provider: "", model: "" };
  return {
    ok: data.ok ?? false,
    generatedAt: data.generatedAt ?? new Date().toISOString(),
    serverTime: new Date().toISOString(),
    llm: {
      configured: llm.configured ?? false,
      provider: llm.provider ?? "",
      model: llm.model ?? "",
    },
    services: {
      total: data.services?.total ?? 0,
      active: data.services?.active ?? 0,
      missingHeroCount: data.services?.missingHeroCount ?? 0,
    },
    workPositions: {
      total: data.workPositions?.total ?? 0,
      active: data.workPositions?.active ?? 0,
    },
    serviceRequests: {
      total: data.serviceRequests?.total ?? 0,
      new: data.serviceRequests?.new ?? 0,
      draft: data.serviceRequests?.draft ?? 0,
    },
    orders: {
      paymentProofPendingCount: data.orders?.paymentProofPendingCount ?? 0,
    },
    settings: {
      missingKeys: Array.isArray(data.settings?.missingKeys)
        ? data.settings.missingKeys
        : [],
    },
    jarvisx: {
      chatTotal24h: data.jarvisx?.chatTotal24h ?? 0,
      chatOk24h: data.jarvisx?.chatOk24h ?? 0,
      chatErrorRate24h: data.jarvisx?.chatErrorRate24h ?? 0,
    },
  };
}

exports.healthReport = async (req, res) => {
  res.set("Cache-Control", "no-store");

  try {
    const llm = getJarvisLlmStatus();

    // Wrap each query individually to prevent one failure from breaking all
    const safeCount = async (model, filter = {}) => {
      try {
        return await model.countDocuments(filter);
      } catch (e) {
        console.error(
          `[JARVISX_HEALTH_COUNT_FAIL] model=${
            model?.modelName || "unknown"
          } err=${e?.message}`,
        );
        return 0;
      }
    };

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
      safeCount(Service, {}),
      safeCount(Service, { active: true }),
      safeCount(Service, {
        $or: [{ imageUrl: { $exists: false } }, { imageUrl: "" }],
      }),
      safeCount(WorkPosition, {}),
      safeCount(WorkPosition, { active: true }),
      safeCount(ServiceRequest, {}),
      safeCount(ServiceRequest, { status: "new" }),
      safeCount(ServiceRequest, { status: "draft" }),
      safeCount(Order, {
        status: { $in: ["payment_submitted", "pending_review", "review"] },
        "payment.proofUrl": { $exists: true, $ne: "" },
        "payment.verifiedAt": { $in: [null, undefined] },
      }),
    ]);

    let missingSettings = [];
    try {
      const settings = await SiteSettings.findOne({
        singletonKey: "main",
      }).lean();
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
    } catch (e) {
      console.error(`[JARVISX_HEALTH_SETTINGS_FAIL] err=${e?.message}`);
      missingSettings = ["(settings query failed)"];
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let chatTotal24h = 0;
    let chatOk24h = 0;
    try {
      [chatTotal24h, chatOk24h] = await Promise.all([
        JarvisChatEvent.countDocuments({ createdAt: { $gte: since } }),
        JarvisChatEvent.countDocuments({
          createdAt: { $gte: since },
          ok: true,
        }),
      ]);
    } catch (e) {
      console.error(`[JARVISX_HEALTH_CHAT_FAIL] err=${e?.message}`);
    }
    const chatErrorRate24h = chatTotal24h
      ? Number(((chatTotal24h - chatOk24h) / chatTotal24h).toFixed(4))
      : 0;

    return res.json(
      buildSafeHealthResponse({
        ok: true,
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
      }),
    );
  } catch (err) {
    console.error(`[JARVISX_HEALTH_FAIL] errMessage=${err?.message}`);
    // ALWAYS return 200 with stable shape - frontend depends on this contract
    return res.json(
      buildSafeHealthResponse({
        ok: false,
        generatedAt: new Date().toISOString(),
      }),
    );
  }
};

// Exported for unit-like reuse in routes/controllers
exports._internal = {
  getPublicContextObject,
  getAdminContextObject,
  fallbackAnswerFromContext,
};
