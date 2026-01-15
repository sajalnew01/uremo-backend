const Service = require("../models/Service");
const PaymentMethod = require("../models/PaymentMethod");
const WorkPosition = require("../models/WorkPosition");
const SiteSettings = require("../models/SiteSettings");
const ServiceRequest = require("../models/ServiceRequest");

const sessionManager = require("../utils/sessionManager");
const {
  classifyIntent,
  getIntentResponse,
} = require("../utils/intentClassifier");
const { groqChatCompletion } = require("../services/jarvisxProviders");

function clampString(value, maxLen) {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!v) return "";
  if (typeof maxLen !== "number" || maxLen <= 0) return v;
  return v.length <= maxLen ? v : v.slice(0, maxLen);
}

function isAdminUser(req) {
  return req.user?.role === "admin";
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
    ]
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
    session?.collectedData || {}
  )}\nUser message: ${message}\n\nRespond as the admin's assistant. Be concise, helpful, and action-oriented.\nNEVER say \"contact admin\" or \"I'm not sure\".\nFormat: \"Yes boss ✅ [action/response]\"`;

  try {
    const completion = await groqChatCompletion(
      [{ role: "user", content: prompt }],
      { temperature: 0.3, max_tokens: 150 }
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

  const wantsAdmin = req.body?.mode === "admin" || req.body?.isAdmin === true;
  const isAdmin = isAdminUser(req);

  if (wantsAdmin) {
    if (!req.user?.id && !req.user?._id) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }
  }

  if (wantsAdmin && brainV1IsGreeting(message)) {
    return res.json({
      ok: true,
      reply: "Yes boss ✅ What can I do for you today?",
      intent: "GREETING",
      quickReplies: [],
    });
  }

  try {
    const session = await sessionManager.getOrCreateSession(req);
    session.collectedData = session.collectedData || {};

    const intent = classifyIntent(message);
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
        `[JarvisX] Intent: ${intent}, Provider: groq, Time: ${responseTime}ms`
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
        `[JarvisX] Intent: ${intent}, Provider: groq, Time: ${responseTime}ms`
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

    let reply;
    if (isAdmin) {
      reply =
        intent === "GENERAL_QUERY"
          ? intentInfo.admin
          : await brainV1GenerateAdminResponse(message, intent, session);
    } else {
      reply = intentInfo.public;
    }

    await sessionManager.addMessage(session, "user", message);
    await sessionManager.addMessage(session, "jarvis", reply);

    const responseTime = Date.now() - startTime;
    console.log(
      `[JarvisX] Intent: ${intent}, Provider: groq, Time: ${responseTime}ms`
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

    return res.status(500).json({
      ok: false,
      reply: wantsAdmin
        ? "System updating. Please check back in 2 minutes."
        : "Assistant is currently updating. Please try again in a moment.",
      intent: "ERROR",
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

exports.healthReport = async (req, res) => {
  try {
    const llm = getGroqStatus();
    const [
      totalServices,
      activeServices,
      totalWorkPositions,
      activeWorkPositions,
    ] = await Promise.all([
      Service.countDocuments({}),
      Service.countDocuments({ active: true }),
      WorkPosition.countDocuments({}),
      WorkPosition.countDocuments({ active: true }),
    ]);

    res.set("Cache-Control", "no-store");
    return res.json({
      generatedAt: new Date().toISOString(),
      llm,
      counts: {
        services: { total: totalServices, active: activeServices },
        workPositions: {
          total: totalWorkPositions,
          active: activeWorkPositions,
        },
      },
    });
  } catch (err) {
    console.error(`[JARVISX_HEALTH_FAIL] errMessage=${err?.message}`);
    return res
      .status(500)
      .json({ message: "Unable to generate health report" });
  }
};

exports._internal = {
  getPublicContextObject,
  getAdminContextObject,
};
