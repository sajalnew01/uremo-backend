/**
 * DETERMINISTIC INTENT CLASSIFIER
 * No LLM calls, only regex patterns
 * Must execute in < 50ms
 */

const INTENT_PATTERNS = {
  INTERVIEW_HELP: [
    /assessment/i,
    /screening/i,
    /interview/i,
    /video test/i,
    /practice interview/i,
    /interview help/i,
    /interview support/i,
  ],

  BUY_SERVICE: [
    /buy/i,
    /purchase/i,
    /order/i,
    /need service/i,
    /want to buy/i,
    /how to buy/i,
    /get service/i,
    /service price/i,
    /what services/i,
    /show services/i,
  ],

  ORDER_STATUS: [
    /status/i,
    /update/i,
    /delivery/i,
    /when will/i,
    /where is/i,
    /order update/i,
    /track order/i,
    /order status/i,
  ],

  PAYMENT_HELP: [
    /paid/i,
    /payment/i,
    /transaction/i,
    /verify/i,
    /screenshot/i,
    /payment proof/i,
    /i have paid/i,
    /sent payment/i,
  ],

  CUSTOM_SERVICE: [
    /not listed/i,
    /custom/i,
    /special request/i,
    /add service/i,
    /handshake ai/i,
    /need bybit/i,
    /not available/i,
  ],
};

/**
 * Classify user message intent
 * @param {string} text - User message
 * @returns {string} Intent string
 */
function classifyIntent(text) {
  if (!text || typeof text !== "string") return "GENERAL_QUERY";

  const lowerText = text.toLowerCase();
  let detectedIntent = "GENERAL_QUERY";
  let highestScore = 0;

  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(lowerText)) {
        // Score by pattern match
        const score = 1;
        if (score > highestScore) {
          highestScore = score;
          detectedIntent = intent;
        }
        break; // Found match for this intent, move to next intent
      }
    }
  }

  return detectedIntent;
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

    GENERAL_QUERY: {
      admin: "Yes boss ✅ I'm here. What should I handle?",
      public: "I can help with services, orders, or support. What do you need?",
      quickReplies: ["Buy service", "Order status", "Interview help"],
    },
  };

  return templates[intent] || templates.GENERAL_QUERY;
}

module.exports = {
  classifyIntent,
  getIntentResponse,
};
