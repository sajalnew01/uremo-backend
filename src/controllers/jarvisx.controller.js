const jwt = require("jsonwebtoken");
const SiteSettingsController = require("./siteSettings.controller");
const Service = require("../models/Service");
const PaymentMethod = require("../models/PaymentMethod");
const WorkPosition = require("../models/WorkPosition");

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

  try {
    const context =
      mode === "admin"
        ? await getAdminContextObject()
        : await getPublicContextObject();

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

    const system = `You are JarvisX, the UREMO 24/7 support brain in READ-ONLY mode.\n\nRules:\n- READ ONLY: never suggest creating/editing/deleting data.\n- Only answer using the provided CONTEXT JSON.\n- If the answer is not clearly present in CONTEXT, reply exactly: \"I’m not sure. Please contact admin in Order Support Chat.\"\n- Keep replies short, direct, business tone.\n- Return STRICT JSON with keys: reply (string), confidence (0-1), usedSources (array of strings from [settings, services, paymentMethods, workPositions, rules]), suggestedActions (array of {label,url}).\n\nCONTEXT JSON:\n${JSON.stringify(
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
