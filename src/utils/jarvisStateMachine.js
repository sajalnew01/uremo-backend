/**
 * JarvisX State Machine — P0 Brain Stability Fix
 *
 * This module provides deterministic conversation flow management.
 * It prevents greeting resets and ensures quick replies route correctly.
 */

/**
 * Quick reply to flow/step mapping
 * When a quick reply is clicked, we set flow+step IMMEDIATELY
 * This prevents the greeting reset bug.
 */
const QUICK_REPLY_ROUTES = {
  // Service buying flow
  "buy service": { flow: "BUY_SERVICE", step: "ASK_SERVICE_TYPE" },
  "buy a service": { flow: "BUY_SERVICE", step: "ASK_SERVICE_TYPE" },
  "browse services": { flow: "BUY_SERVICE", step: "LIST_SERVICES" },
  "show services": { flow: "BUY_SERVICE", step: "LIST_SERVICES" },
  "need custom service": { flow: "CUSTOM_SERVICE", step: "ASK_SERVICE_TYPE" },

  // KYC specifically
  "kyc help": { flow: "BUY_SERVICE", step: "ASK_PLATFORM", serviceType: "KYC" },
  "kyc service": {
    flow: "BUY_SERVICE",
    step: "ASK_PLATFORM",
    serviceType: "KYC",
  },
  "kyc verification": {
    flow: "BUY_SERVICE",
    step: "ASK_PLATFORM",
    serviceType: "KYC",
  },

  // Order status flow
  "order status": { flow: "ORDER_STATUS", step: "ASK_ORDER_ID" },
  "check order": { flow: "ORDER_STATUS", step: "ASK_ORDER_ID" },
  "check orders": { flow: "ORDER_STATUS", step: "ASK_ORDER_ID" },
  "my orders": { flow: "ORDER_STATUS", step: "ASK_ORDER_ID" },

  // Interview help flow
  "interview help": { flow: "INTERVIEW_HELP", step: "ASK_INTERVIEW_PLATFORM" },
  "assessment help": { flow: "INTERVIEW_HELP", step: "ASK_INTERVIEW_PLATFORM" },
  "interview support": {
    flow: "INTERVIEW_HELP",
    step: "ASK_INTERVIEW_PLATFORM",
  },

  // Payment help flow
  "payment help": { flow: "PAYMENT_HELP", step: "ASK_ORDER_ID" },
  "payment status": { flow: "PAYMENT_HELP", step: "ASK_ORDER_ID" },
  "check payment status": { flow: "PAYMENT_HELP", step: "ASK_ORDER_ID" },
  "upload proof": { flow: "PAYMENT_HELP", step: "ASK_ORDER_ID" },

  // Custom service flow
  "custom request": { flow: "CUSTOM_SERVICE", step: "ASK_SERVICE_TYPE" },
  "custom service": { flow: "CUSTOM_SERVICE", step: "ASK_SERVICE_TYPE" },

  // Apply to work flow
  "apply to work": { flow: "APPLY_TO_WORK", step: "LIST_SERVICES" },

  // Talk to admin (escalation)
  "talk to admin": { flow: null, step: null, escalate: true },
  "contact support": { flow: null, step: null, escalate: true },
};

/**
 * Step-based response templates
 * If a flow+step exists, return this response instead of greeting
 */
const STEP_RESPONSES = {
  // BUY_SERVICE flow
  "BUY_SERVICE:ASK_SERVICE_TYPE": {
    reply:
      "What type of service do you need? We offer KYC verification, interview support, account creation, and more.",
    quickReplies: ["KYC help", "Interview help", "Account setup", "Other"],
  },
  "BUY_SERVICE:LIST_SERVICES": {
    reply: "Here are our available services. Which one interests you?",
    quickReplies: ["KYC help", "Interview help", "Custom request"],
    showServices: true,
  },
  "BUY_SERVICE:ASK_PLATFORM": {
    reply: "✅ Great — which platform is this for?",
    quickReplies: ["HFM", "Binance", "Bybit", "PayPal", "Other"],
  },
  "BUY_SERVICE:ASK_REGION": {
    reply: "Which country/region do you need this for?",
    quickReplies: ["USA", "UK", "Nigeria", "Other"],
  },
  "BUY_SERVICE:ASK_URGENCY": {
    reply: "How urgent is this? When do you need it done?",
    quickReplies: ["ASAP", "This week", "Flexible"],
  },

  // ORDER_STATUS flow
  "ORDER_STATUS:ASK_ORDER_ID": {
    reply:
      "To check your order status, please share your order ID or open your order from the Orders page.",
    quickReplies: ["Go to Orders"],
    suggestedActions: [{ label: "My Orders", url: "/orders" }],
  },

  // INTERVIEW_HELP flow
  "INTERVIEW_HELP:ASK_INTERVIEW_PLATFORM": {
    reply:
      "Yes ✅ We can help with interview/screening assessments. Which platform is it for?",
    quickReplies: ["Outlier", "HFM", "TikTok", "Other"],
  },
  "INTERVIEW_HELP:ASK_INTERVIEW_URGENCY": {
    reply: "Got it! How urgent is this assessment?",
    quickReplies: ["ASAP", "This week", "Flexible"],
  },

  // PAYMENT_HELP flow
  "PAYMENT_HELP:ASK_ORDER_ID": {
    reply:
      "I can help with payment questions. Do you have an order ID, or would you like to upload payment proof?",
    quickReplies: ["Upload proof", "Check payment status"],
    suggestedActions: [{ label: "My Orders", url: "/orders" }],
  },

  // CUSTOM_SERVICE flow
  "CUSTOM_SERVICE:ASK_SERVICE_TYPE": {
    reply: "We can handle custom requests! Tell me what service you need.",
    quickReplies: ["KYC help", "Account setup", "Marketing", "Other"],
  },
};

/**
 * Check if message is a known quick reply and get its route
 * @param {string} message - User message text
 * @returns {object|null} Route info or null
 */
function getQuickReplyRoute(message) {
  const normalized = String(message || "")
    .toLowerCase()
    .trim();
  if (!normalized) return null;

  // Direct match
  if (QUICK_REPLY_ROUTES[normalized]) {
    return QUICK_REPLY_ROUTES[normalized];
  }

  // Partial match for common variations
  for (const [key, route] of Object.entries(QUICK_REPLY_ROUTES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return route;
    }
  }

  return null;
}

/**
 * Check if message is a greeting (only when flow is null)
 * @param {string} message
 * @returns {boolean}
 */
function isPureGreeting(message) {
  const msg = String(message || "")
    .toLowerCase()
    .trim();
  if (msg.length > 20) return false;
  return /^(hi|hello|hey|yo|sup|good morning|good afternoon|good evening|howdy|what'?s up)$/i.test(
    msg
  );
}

/**
 * Get response for current flow+step
 * @param {string} flow
 * @param {string} step
 * @param {object} session - Session with collectedData
 * @returns {object|null} Response template or null
 */
function getStepResponse(flow, step, session = {}) {
  const key = `${flow}:${step}`;
  const template = STEP_RESPONSES[key];

  if (!template) return null;

  // Personalize with collected data
  const response = { ...template };
  const collected = session?.collectedData || {};

  // Add platform context if available
  if (collected.platform && step === "ASK_URGENCY") {
    response.reply = `Got it, ${collected.platform}. ${template.reply}`;
  }

  // Add service type context
  if (collected.serviceType && step === "ASK_PLATFORM") {
    response.reply = `✅ Great — for ${collected.serviceType} help, which platform is this for?`;
  }

  return response;
}

/**
 * Apply quick reply route to session
 * @param {object} session - JarvisSession document
 * @param {object} route - Route from getQuickReplyRoute
 */
function applyRouteToSession(session, route) {
  if (!route) return;

  if (route.flow !== undefined) session.flow = route.flow;
  if (route.step !== undefined) session.step = route.step;
  if (route.serviceType) {
    if (!session.collectedData) session.collectedData = {};
    session.collectedData.serviceType = route.serviceType;
  }
}

/**
 * Advance to next step in flow
 * @param {object} session - JarvisSession document
 * @param {string} currentAnswer - User's answer to current step
 * @returns {object} Next step info { nextStep, complete }
 */
function advanceFlow(session, currentAnswer = "") {
  const flow = session.flow;
  const step = session.step;
  const collected = session.collectedData || {};

  if (!flow || !step) return { nextStep: null, complete: false };

  // BUY_SERVICE flow progression
  if (flow === "BUY_SERVICE") {
    if (step === "ASK_SERVICE_TYPE" || step === "LIST_SERVICES") {
      // After service type selected, ask platform
      return { nextStep: "ASK_PLATFORM", complete: false };
    }
    if (step === "ASK_PLATFORM") {
      // After platform, ask region or urgency
      if (!collected.region) {
        return { nextStep: "ASK_REGION", complete: false };
      }
      return { nextStep: "ASK_URGENCY", complete: false };
    }
    if (step === "ASK_REGION") {
      return { nextStep: "ASK_URGENCY", complete: false };
    }
    if (step === "ASK_URGENCY") {
      return { nextStep: "COMPLETE", complete: true };
    }
  }

  // INTERVIEW_HELP flow progression
  if (flow === "INTERVIEW_HELP") {
    if (step === "ASK_INTERVIEW_PLATFORM") {
      return { nextStep: "ASK_INTERVIEW_URGENCY", complete: false };
    }
    if (step === "ASK_INTERVIEW_URGENCY") {
      return { nextStep: "COMPLETE", complete: true };
    }
  }

  return { nextStep: null, complete: false };
}

/**
 * Check if session has an active flow (prevents greeting reset)
 * @param {object} session
 * @returns {boolean}
 */
function hasActiveFlow(session) {
  return !!(
    session?.flow &&
    session?.step &&
    session.step !== "COMPLETE" &&
    session.step !== "CANCELLED" &&
    session.step !== "DONE"
  );
}

/**
 * Reset session flow (for cancel/restart)
 * @param {object} session
 */
function resetFlow(session) {
  session.flow = null;
  session.step = null;
  session.collectedData = {};
  session.askedQuestions = [];
}

module.exports = {
  QUICK_REPLY_ROUTES,
  STEP_RESPONSES,
  getQuickReplyRoute,
  isPureGreeting,
  getStepResponse,
  applyRouteToSession,
  advanceFlow,
  hasActiveFlow,
  resetFlow,
};
