/**
 * DETERMINISTIC INTENT CLASSIFIER
 * No LLM calls, only explicit regex patterns.
 * Important: NEVER match BUY_SERVICE just because text contains "service".
 */

// P0: Explicit purchase intent only (prevents hijacking normal sentences)
const BUY_PAT =
  /(\bbuy\b|\bpurchase\b|\border\s+now\b|\bplace\s+order\b|\bcheckout\b|\bget\s+service\b|\bneed\s+service\s+to\s+buy\b|\bwant\s+to\s+buy\b|\bhow\s+to\s+buy\b)/i;
const STATUS_PAT =
  /(\border\s+status\b|\btrack\b|\btracking\b|\bdelivery\b|\bwhere\s+is\s+my\s+order\b|\border\s+update\b|\bwhen\s+will\b)/i;
const INTERVIEW_PAT =
  /(\bassessment\b|\bscreening\b|\binterview\b|\bvideo\s+test\b|\binterview\s+help\b|\binterview\s+support\b)/i;

// Keep additional deterministic intents, but keep patterns explicit
const PAYMENT_PAT =
  /(\bpayment\b|\bpaid\b|\btransaction\b|\bpayment\s+proof\b|\bscreenshot\b|\bi\s+have\s+paid\b|\bsent\s+payment\b|\bverify\s+payment\b)/i;
const CUSTOM_SERVICE_PAT =
  /(\bcustom\b|\bnot\s+listed\b|\bspecial\s+request\b|\badd\s+service\b|\bnot\s+available\b)/i;

/**
 * Classify user message intent
 * @param {string} text - User message
 * @returns {string} Intent string
 */
function classifyIntent(text) {
  if (!text || typeof text !== "string") return "GENERAL_CHAT";
  const t = text.trim();
  if (!t) return "GENERAL_CHAT";

  // Deterministic flows
  if (BUY_PAT.test(t)) return "BUY_SERVICE";
  if (STATUS_PAT.test(t)) return "ORDER_STATUS";
  if (INTERVIEW_PAT.test(t)) return "INTERVIEW_HELP";

  // Other explicit intents
  if (PAYMENT_PAT.test(t)) return "PAYMENT_HELP";
  if (CUSTOM_SERVICE_PAT.test(t)) return "CUSTOM_SERVICE";

  return "GENERAL_CHAT";
}

/**
 * Get response template for intent
 */
function getIntentResponse(intent, isAdmin = false) {
  const templates = {
    INTERVIEW_HELP: {
      admin:
        "Interview support request detected. Need me to check existing services or create custom?",
      public:
        "Yes ✅ we help with screening/interviews. Which platform is this for?",
      quickReplies: ["Outlier", "HFM", "DataAnnotation", "Other"],
      nextQuestion: "platform",
    },

    BUY_SERVICE: {
      admin: "Purchase intent. Show available services or proceed with custom?",
      public:
        "Sure ✅ which service do you want? You can say 'KYC help' or 'Show services'.",
      quickReplies: ["Show services", "Custom request", "Talk to admin"],
      nextQuestion: "service_selection",
    },

    ORDER_STATUS: {
      admin:
        "Order status inquiry. Should I check database or ask for details?",
      public: "I'll check your order status. What's your order ID or email?",
      nextQuestion: "order_identifier",
    },

    CUSTOM_SERVICE: {
      admin: "Custom service request. Create proposal or collect details?",
      public: "Got it ✅ what's the service name you need?",
      nextQuestion: "service_name",
    },

    PAYMENT_HELP: {
      admin:
        "Payment verification needed. Check payments table or request screenshot?",
      public: "Payment help? Please send your payment screenshot and email.",
      nextQuestion: "payment_proof",
    },

    GENERAL_CHAT: {
      admin: "Yes boss ✅ I'm here. What should I handle?",
      public: "",
      quickReplies: ["Buy service", "Order status", "Interview help"],
    },
  };

  return templates[intent] || templates.GENERAL_CHAT;
}

module.exports = {
  classifyIntent,
  getIntentResponse,
};
