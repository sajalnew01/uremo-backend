/**
 * JarvisX Intent Classifier — Deterministic (No LLM)
 * Classifies user messages into intents based on keyword patterns.
 * Fast, predictable, and consistent.
 */

/**
 * Intent types enum
 */
const INTENTS = {
  INTERVIEW_ASSESSMENT: "INTERVIEW_ASSESSMENT",
  BUY_SERVICE: "BUY_SERVICE",
  CUSTOM_SERVICE: "CUSTOM_SERVICE",
  ORDER_STATUS: "ORDER_STATUS",
  ORDER_DELIVERY: "ORDER_DELIVERY",
  PAYMENT_HELP: "PAYMENT_HELP",
  APPLY_TO_WORK: "APPLY_TO_WORK",
  GENERAL_SUPPORT: "GENERAL_SUPPORT",
};

/**
 * Normalize text for pattern matching
 * @param {string} s - Input string
 * @returns {string} Normalized string (lowercase, alphanumeric only)
 */
function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Classify user intent deterministically (no LLM)
 * Order matters — more specific patterns first
 * @param {string} text - User message
 * @returns {string} Intent from INTENTS enum
 */
function classifyIntent(text) {
  const msg = normalizeText(text);
  if (!msg) return INTENTS.GENERAL_SUPPORT;

  // INTERVIEW_ASSESSMENT: interview, assessment, screening
  if (/(interview|assessment|screening|test\s*taking|exam\s*help)/.test(msg)) {
    return INTENTS.INTERVIEW_ASSESSMENT;
  }

  // APPLY_TO_WORK: apply, application, job, work position, hiring
  if (
    /(apply|application|job|work position|work positions|hiring|career|resume|cv)/.test(
      msg
    )
  ) {
    return INTENTS.APPLY_TO_WORK;
  }

  // PAYMENT_HELP: paid, payment, verify, verification, transaction, proof, receipt
  if (
    /(paid|payment|verify|verification|transaction|receipt|proof|refund|charge)/.test(
      msg
    )
  ) {
    return INTENTS.PAYMENT_HELP;
  }

  // ORDER_STATUS / ORDER_DELIVERY: delivery, when will, order status, update, late, delayed
  if (
    /(delivery|when will|when do i get|timeframe|delivered|late|delayed|status|update|eta|tracking)/.test(
      msg
    )
  ) {
    return INTENTS.ORDER_DELIVERY;
  }

  // BUY_SERVICE: buy, purchase, order, checkout
  if (/(buy|purchase|order|checkout|get\s*service|need\s*service)/.test(msg)) {
    return INTENTS.BUY_SERVICE;
  }

  // CUSTOM_SERVICE: not available, custom, need service, looking for, can you build
  if (
    /(not available|not listed|custom|looking for|can you build|can you make|need bybit|need new|special request|unlisted)/.test(
      msg
    )
  ) {
    return INTENTS.CUSTOM_SERVICE;
  }

  return INTENTS.GENERAL_SUPPORT;
}

/**
 * Check if message indicates user confusion
 * @param {string} text - User message
 * @returns {boolean} true if user is confused
 */
function isConfusedMessage(text) {
  const msg = normalizeText(text);
  return /(i don t understand|dont understand|what do you mean|you don t get my point|confused|not clear|huh|what|sorry|don t get it|explain|unclear)/.test(
    msg
  );
}

/**
 * Check if message is a cancellation request
 * @param {string} text - User message
 * @returns {boolean} true if user wants to cancel
 */
function wantsCancel(text) {
  const msg = normalizeText(text);
  return /(cancel|never mind|nevermind|stop|forget it|abort|quit|exit)/.test(
    msg
  );
}

/**
 * Check if message is a greeting (no real intent)
 * @param {string} text - User message
 * @returns {boolean} true if just a greeting
 */
function isGreeting(text) {
  const msg = normalizeText(text);
  // Very short messages that are just greetings
  if (msg.length < 15) {
    return /^(hi|hello|hey|sup|yo|good morning|good afternoon|good evening|howdy)$/.test(
      msg
    );
  }
  return false;
}

/**
 * Check if message is affirmative (yes, ok, sure)
 * @param {string} text - User message
 * @returns {boolean}
 */
function isAffirmative(text) {
  const msg = normalizeText(text);
  return /^(yes|yeah|yep|ok|okay|sure|correct|right|exactly|yea|yup|affirmative)$/.test(
    msg
  );
}

/**
 * Check if message is negative (no, nope)
 * @param {string} text - User message
 * @returns {boolean}
 */
function isNegative(text) {
  const msg = normalizeText(text);
  return /^(no|nope|nah|negative|not really|not yet)$/.test(msg);
}

/**
 * Extract platform name from message if present
 * @param {string} text - User message
 * @returns {string|null} Platform name or null
 */
function extractPlatform(text) {
  const msg = normalizeText(text);

  const platforms = [
    { pattern: /outlier/, name: "Outlier" },
    { pattern: /hfm/, name: "HFM" },
    { pattern: /tiktok|tik tok/, name: "TikTok" },
    { pattern: /instagram|insta/, name: "Instagram" },
    { pattern: /facebook|fb/, name: "Facebook" },
    { pattern: /paypal/, name: "PayPal" },
    { pattern: /binance/, name: "Binance" },
    { pattern: /stripe/, name: "Stripe" },
    { pattern: /shopify/, name: "Shopify" },
    { pattern: /amazon/, name: "Amazon" },
    { pattern: /upwork/, name: "Upwork" },
    { pattern: /fiverr/, name: "Fiverr" },
    { pattern: /google/, name: "Google" },
    { pattern: /twitter|x\.com/, name: "Twitter/X" },
    { pattern: /linkedin/, name: "LinkedIn" },
    { pattern: /youtube/, name: "YouTube" },
  ];

  for (const p of platforms) {
    if (p.pattern.test(msg)) return p.name;
  }
  return null;
}

/**
 * Extract urgency level from message
 * @param {string} text - User message
 * @returns {string|null} Urgency level or null
 */
function extractUrgency(text) {
  const msg = normalizeText(text);

  if (/(asap|urgent|now|today|immediately|right now)/.test(msg)) return "asap";
  if (/(this week|week|7 days|few days)/.test(msg)) return "this_week";
  if (/(this month|month|30 days)/.test(msg)) return "this_month";
  if (/(flex|flexible|whenever|no rush|any time|anytime)/.test(msg))
    return "flexible";

  return null;
}

/**
 * Get quick replies based on intent
 * @param {string} intent - Current intent
 * @param {object} session - Session with collected data
 * @returns {string[]} Array of quick reply options
 */
function getQuickRepliesForIntent(intent, session = {}) {
  const collected = session?.collected || {};

  switch (intent) {
    case INTENTS.INTERVIEW_ASSESSMENT:
      if (!collected.platform) {
        return ["Outlier", "HFM", "TikTok", "Other"];
      }
      if (!collected.urgency) {
        return ["ASAP", "This week", "Flexible"];
      }
      return [];

    case INTENTS.CUSTOM_SERVICE:
      if (!collected.platform) {
        return ["Outlier", "PayPal", "Binance", "Other"];
      }
      if (!collected.urgency) {
        return ["ASAP", "This week", "Flexible"];
      }
      return [];

    case INTENTS.BUY_SERVICE:
      return ["Browse Services", "Need Custom Service", "Ask Question"];

    case INTENTS.PAYMENT_HELP:
      return ["Check Payment Status", "Upload Proof", "Contact Support"];

    case INTENTS.ORDER_DELIVERY:
      return ["Check Order Status", "Contact Support"];

    case INTENTS.GENERAL_SUPPORT:
      return [
        "Browse Services",
        "Check Orders",
        "Payment Help",
        "Apply to Work",
      ];

    default:
      return [];
  }
}

/**
 * Get clarify mode quick replies (when user is confused)
 * @returns {string[]}
 */
function getClarifyQuickReplies() {
  return [
    "Outlier Service",
    "Payment Help",
    "Order Delivery",
    "Custom Service",
    "Apply to Work",
  ];
}

/**
 * Get platform quick replies
 * @returns {string[]}
 */
function platformQuickReplies() {
  return ["Outlier", "HFM", "TikTok", "Other"];
}

/**
 * Get urgency quick replies
 * @returns {string[]}
 */
function urgencyQuickReplies() {
  return ["ASAP", "This week", "Flexible"];
}

module.exports = {
  INTENTS,
  normalizeText,
  classifyIntent,
  isConfusedMessage,
  wantsCancel,
  isGreeting,
  isAffirmative,
  isNegative,
  extractPlatform,
  extractUrgency,
  getQuickRepliesForIntent,
  getClarifyQuickReplies,
  platformQuickReplies,
  urgencyQuickReplies,
};
