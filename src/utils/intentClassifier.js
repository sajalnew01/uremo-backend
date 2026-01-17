/**
 * DETERMINISTIC INTENT CLASSIFIER
 * No LLM calls, only explicit regex patterns.
 * Important: NEVER match BUY_SERVICE just because text contains "service".
 */

function normalize(text) {
  return String(text || "")
    .trim()
    .toLowerCase();
}

function escapeRegExp(str) {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseQuantity(text) {
  const t = normalize(text);
  if (!t) return null;

  // e.g. "10 accounts", "2 kyc", "x5"
  const m1 = t.match(
    /\b(?:x\s*)?(\d{1,4})\s*(?:accounts?|kyc|accs?|pcs?|pieces?)\b/i
  );
  if (m1?.[1]) {
    const n = Number(m1[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const m2 = t.match(/\bqty\s*[:=]?\s*(\d{1,4})\b/i);
  if (m2?.[1]) {
    const n = Number(m2[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  return null;
}

function parseUnitPrice(text) {
  const raw = String(text || "");
  if (!raw.trim()) return null;

  // $8, $8.50, 8$, USD 8
  const m1 = raw.match(/\$\s*(\d{1,6}(?:\.\d{1,2})?)/);
  if (m1?.[1]) {
    const n = Number(m1[1]);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  const m2 = raw.match(/\b(\d{1,6}(?:\.\d{1,2})?)\s*\$\b/);
  if (m2?.[1]) {
    const n = Number(m2[1]);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  const m3 = raw.match(/\b(?:usd|us\s*dollars?)\s*(\d{1,6}(?:\.\d{1,2})?)\b/i);
  if (m3?.[1]) {
    const n = Number(m3[1]);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  // "at 8 per" (only if anchored by per/account)
  const m4 = raw.match(
    /\b(?:at|for)\s*(\d{1,6}(?:\.\d{1,2})?)\s*(?:per\s*(?:account|acc|kyc)|\/\s*(?:account|acc|kyc))\b/i
  );
  if (m4?.[1]) {
    const n = Number(m4[1]);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  return null;
}

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

// Dedicated intents (PATCH_09)
const LIST_SERVICES_PAT =
  /(\bshow\s+services\b|\bservices\s+list\b|\blist\s+services\b|\bavailable\s+services\b|\bwhat\s+services\b)/i;

// User identity (who am I?)
const USER_IDENTITY_PAT =
  /(\bwho\s+am\s+i\b|\bidentify\s+me\b|\bwhat\s+is\s+my\s+(?:name|email)\b|\bam\s+i\s+logged\s+in\b|\bmy\s+account\b)/i;

// Assistant identity (who are you?)
const ASSISTANT_IDENTITY_PAT =
  /(\bwhat'?s\s+your\s+name\b|\bwho\s+are\s+you\b|\bwhat\s+are\s+you\b|\bare\s+you\s+jarvis\b|\bjarvisx\b|\bjarvis\b)/i;

// Platform purchase requests (specific; do NOT trigger without purchase intent)
const PLATFORM_KEYWORDS = [
  "bybit",
  "binance",
  "okx",
  "kucoin",
  "bitget",
  "coinbase",
  "hfm",
  "outlier",
  "dataannotation",
  "paypal",
  "wise",
  "payoneer",
];

const PURCHASE_VERB_PAT =
  /(\bbuy\b|\bpurchase\b|\bneed\b|\bwant\b|\bget\b|\border\b|\blooking\s+for\b)/i;
const ACCOUNT_OBJECT_PAT = /(\baccount\b|\baccounts\b|\bkyc\b)/i;

/**
 * Classify user message intent
 * @param {string} text - User message
 * @returns {string} Intent string
 */
function classifyIntent(text) {
  if (!text || typeof text !== "string") return "GENERAL_CHAT";
  const t = text.trim();
  if (!t) return "GENERAL_CHAT";

  // Dedicated intents (keep first to avoid being swallowed by templates)
  if (USER_IDENTITY_PAT.test(t)) return "USER_IDENTITY_QUERY";
  // Assistant identity should be below USER_IDENTITY to avoid "who am I" matching "who are"
  if (ASSISTANT_IDENTITY_PAT.test(t)) return "ASSISTANT_IDENTITY";
  if (LIST_SERVICES_PAT.test(t)) return "LIST_SERVICES";

  // Specific purchase request with platform + buy intent (or platform + account + price)
  const lower = normalize(t);
  const platform = PLATFORM_KEYWORDS.find((k) => lower.includes(k));
  const hasPurchaseVerb = PURCHASE_VERB_PAT.test(t);
  const hasAccountObject = ACCOUNT_OBJECT_PAT.test(t);
  const unitPrice = parseUnitPrice(t);
  if (
    platform &&
    ((hasPurchaseVerb && hasAccountObject) ||
      (hasPurchaseVerb && platform) ||
      (hasAccountObject && unitPrice != null))
  ) {
    return "SERVICE_PURCHASE_REQUEST";
  }

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
 * Detailed classifier (intent + extracted fields)
 * @param {string} text
 * @returns {{ intent: string, entities: { platform?: string, unitPrice?: number|null, quantity?: number|null } }}
 */
function classifyIntentDetailed(text) {
  const intent = classifyIntent(text);
  const lower = normalize(text);

  let platform = null;
  for (const k of PLATFORM_KEYWORDS) {
    if (lower.includes(k)) {
      platform = k;
      break;
    }
  }

  // If platform isn't a known keyword, try a very light heuristic (only when purchase verb present)
  if (!platform && PURCHASE_VERB_PAT.test(String(text || ""))) {
    const m = String(text || "").match(
      /\b(?:buy|need|want|get|purchase)\s+([a-z0-9_-]{3,20})\b/i
    );
    if (m?.[1]) platform = String(m[1]).toLowerCase();
  }

  const unitPrice = parseUnitPrice(text);
  const quantity = parseQuantity(text);

  return {
    intent,
    entities: {
      ...(platform ? { platform } : {}),
      unitPrice,
      quantity,
    },
  };
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
  classifyIntentDetailed,
  getIntentResponse,
};
