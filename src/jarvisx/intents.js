/**
 * PATCH_51: JarvisX Intent Dictionary
 * Master list of all intents JarvisX can handle
 * Intent detection is RULE-BASED, not LLM-based
 */

const INTENTS = {
  // =========== GENERAL ===========
  GREETING: "GREETING",
  UNKNOWN: "UNKNOWN",
  CONFUSED: "CONFUSED",
  CANCEL: "CANCEL",
  CONFIRM: "CONFIRM",

  // =========== SERVICE DISCOVERY ===========
  EXPLORE_SERVICES: "EXPLORE_SERVICES",
  SERVICE_DETAILS: "SERVICE_DETAILS",

  // =========== USER ACTIONS ===========
  BUY_SERVICE: "BUY_SERVICE",
  RENT_SERVICE: "RENT_SERVICE",
  DEAL_SERVICE: "DEAL_SERVICE",
  APPLY_TO_WORK: "APPLY_TO_WORK",
  CUSTOM_SERVICE_REQUEST: "CUSTOM_SERVICE_REQUEST",

  // =========== ORDER MANAGEMENT ===========
  ORDER_STATUS: "ORDER_STATUS",
  MY_ORDERS: "MY_ORDERS",
  ORDER_HELP: "ORDER_HELP",

  // =========== RENTAL MANAGEMENT ===========
  MY_RENTALS: "MY_RENTALS",
  RENTAL_HELP: "RENTAL_HELP",

  // =========== WALLET ===========
  WALLET_BALANCE: "WALLET_BALANCE",
  WALLET_TOPUP: "WALLET_TOPUP",
  WALLET_HISTORY: "WALLET_HISTORY",

  // =========== WORKSPACE (WORKER FLOW) ===========
  WORKSPACE_STATUS: "WORKSPACE_STATUS",
  SCREENING_HELP: "SCREENING_HELP",
  PROJECT_HELP: "PROJECT_HELP",
  EARNINGS_STATUS: "EARNINGS_STATUS",

  // =========== AFFILIATE ===========
  AFFILIATE_STATUS: "AFFILIATE_STATUS",
  AFFILIATE_LINK: "AFFILIATE_LINK",

  // =========== SUPPORT ===========
  SUPPORT_TICKET: "SUPPORT_TICKET",
  GENERAL_SUPPORT: "GENERAL_SUPPORT",

  // =========== ADMIN INTENTS (role-protected) ===========
  ADMIN_DASHBOARD: "ADMIN_DASHBOARD",
  ADMIN_PENDING_ORDERS: "ADMIN_PENDING_ORDERS",
  ADMIN_PENDING_PROOFS: "ADMIN_PENDING_PROOFS",
  ADMIN_PENDING_TICKETS: "ADMIN_PENDING_TICKETS",
  ADMIN_USER_LOOKUP: "ADMIN_USER_LOOKUP",
  ADMIN_SERVICE_MANAGE: "ADMIN_SERVICE_MANAGE",
};

/**
 * Intent patterns for deterministic classification
 * Order matters - more specific patterns first
 */
const INTENT_PATTERNS = [
  // ============ GREETINGS ============
  {
    intent: INTENTS.GREETING,
    patterns: [
      /^(?:hi|hello|hey|good\s*(?:morning|afternoon|evening)|howdy|yo|sup|greetings?)$/i,
      /^(?:hi|hello|hey)\s*(?:there|jarvis|bot)?$/i,
    ],
  },

  // ============ CONFIRMATIONS ============
  {
    intent: INTENTS.CONFIRM,
    patterns: [
      /^(?:yes|yep|yeah|yup|sure|ok|okay|confirm|proceed|go\s*ahead|do\s*it)$/i,
      /^(?:yes\s*please|that's?\s*correct|absolutely|definitely)$/i,
    ],
  },

  // ============ CANCELLATIONS ============
  {
    intent: INTENTS.CANCEL,
    patterns: [
      /^(?:no|nope|cancel|stop|never\s*mind|forget\s*it|don't|back)$/i,
      /^(?:no\s*thanks?|not\s*now|maybe\s*later)$/i,
    ],
  },

  // ============ ADMIN INTENTS ============
  {
    intent: INTENTS.ADMIN_DASHBOARD,
    patterns: [
      /(?:admin\s*)?dashboard/i,
      /(?:show|get)\s*(?:admin\s*)?stats/i,
      /platform\s*(?:stats|statistics|overview)/i,
    ],
  },
  {
    intent: INTENTS.ADMIN_PENDING_ORDERS,
    patterns: [
      /(?:pending|new|unverified)\s*orders?/i,
      /orders?\s*(?:to\s*)?(?:verify|review|check)/i,
      /(?:how\s*many|count)\s*(?:pending\s*)?orders?/i,
    ],
  },
  {
    intent: INTENTS.ADMIN_PENDING_PROOFS,
    patterns: [
      /(?:pending|new|unreviewed)\s*proofs?/i,
      /proofs?\s*(?:to\s*)?(?:verify|review|check)/i,
      /(?:how\s*many|count)\s*(?:pending\s*)?proofs?/i,
    ],
  },
  {
    intent: INTENTS.ADMIN_PENDING_TICKETS,
    patterns: [
      /(?:pending|open|new)\s*tickets?/i,
      /(?:support\s*)?tickets?\s*(?:to\s*)?(?:answer|review|check)/i,
      /(?:how\s*many|count)\s*(?:open\s*)?tickets?/i,
    ],
  },

  // ============ WORKSPACE ============
  {
    intent: INTENTS.WORKSPACE_STATUS,
    patterns: [
      /(?:my\s*)?workspace/i,
      /(?:worker|work)\s*(?:status|profile|dashboard)/i,
      /(?:show|check)\s*(?:my\s*)?(?:work|worker)\s*(?:status|profile)/i,
    ],
  },
  {
    intent: INTENTS.SCREENING_HELP,
    patterns: [
      /screening\s*(?:test|help|status)/i,
      /(?:take|start|help\s*with)\s*(?:the\s*)?screening/i,
      /(?:how\s*to|can\s*i)\s*(?:pass|take)\s*(?:the\s*)?(?:screening|test)/i,
    ],
  },
  {
    intent: INTENTS.PROJECT_HELP,
    patterns: [
      /(?:my\s*)?(?:assigned\s*)?projects?/i,
      /project\s*(?:help|status|details)/i,
      /(?:current|active)\s*(?:work|project)/i,
    ],
  },
  {
    intent: INTENTS.EARNINGS_STATUS,
    patterns: [
      /(?:my\s*)?earnings?/i,
      /(?:how\s*much|check)\s*(?:have\s*i\s*)?earned/i,
      /(?:pending|total)\s*earnings?/i,
    ],
  },

  // ============ APPLY TO WORK ============
  {
    intent: INTENTS.APPLY_TO_WORK,
    patterns: [
      /(?:apply|application)\s*(?:to\s*)?(?:work|job)/i,
      /(?:want|looking)\s*(?:to\s*)?(?:work|earn|job)/i,
      /(?:job|work)\s*(?:position|opportunity|opening)/i,
      /(?:how\s*(?:to|can\s*i))\s*(?:apply|work|earn|start\s*working)/i,
    ],
  },

  // ============ WALLET ============
  {
    intent: INTENTS.WALLET_BALANCE,
    patterns: [
      /(?:my\s*)?(?:wallet|balance)/i,
      /(?:check|show|get)\s*(?:my\s*)?(?:wallet|balance)/i,
      /(?:how\s*much)\s*(?:money|balance|funds?)/i,
    ],
  },
  {
    intent: INTENTS.WALLET_TOPUP,
    patterns: [
      /(?:add|top\s*up|deposit)\s*(?:money|balance|funds?)/i,
      /(?:wallet\s*)?top\s*up/i,
      /(?:fund|load)\s*(?:my\s*)?wallet/i,
    ],
  },
  {
    intent: INTENTS.WALLET_HISTORY,
    patterns: [
      /(?:wallet|transaction)\s*history/i,
      /(?:show|get)\s*(?:my\s*)?transactions/i,
    ],
  },

  // ============ AFFILIATE ============
  {
    intent: INTENTS.AFFILIATE_STATUS,
    patterns: [
      /(?:affiliate|referral)\s*(?:status|earnings?|balance)/i,
      /(?:my\s*)?(?:affiliate|referral)\s*(?:earnings?|commission)/i,
    ],
  },
  {
    intent: INTENTS.AFFILIATE_LINK,
    patterns: [
      /(?:my\s*)?(?:affiliate|referral)\s*(?:link|code)/i,
      /(?:get|show)\s*(?:my\s*)?(?:referral|affiliate)\s*(?:link|code)/i,
    ],
  },

  // ============ ORDERS ============
  {
    intent: INTENTS.MY_ORDERS,
    patterns: [
      /(?:my\s*)?orders?/i,
      /(?:show|list|get|view)\s*(?:my\s*)?orders?/i,
      /order\s*(?:history|list)/i,
    ],
  },
  {
    intent: INTENTS.ORDER_STATUS,
    patterns: [
      /order\s*(?:status|update|tracking)/i,
      /(?:track|check)\s*(?:my\s*)?order/i,
      /(?:where|when)\s*(?:is\s*)?(?:my\s*)?order/i,
    ],
  },
  {
    intent: INTENTS.ORDER_HELP,
    patterns: [
      /(?:problem|issue|help)\s*(?:with\s*)?(?:my\s*)?order/i,
      /order\s*(?:problem|issue|complaint)/i,
    ],
  },

  // ============ RENTALS ============
  {
    intent: INTENTS.MY_RENTALS,
    patterns: [
      /(?:my\s*)?rentals?/i,
      /(?:show|list|get|view)\s*(?:my\s*)?rentals?/i,
      /(?:active|current)\s*rentals?/i,
    ],
  },
  {
    intent: INTENTS.RENT_SERVICE,
    patterns: [
      /(?:rent|rental|subscribe)/i,
      /(?:want|looking)\s*(?:to\s*)?rent/i,
    ],
  },

  // ============ SERVICES ============
  {
    intent: INTENTS.EXPLORE_SERVICES,
    patterns: [
      /(?:show|list|browse|explore|view)\s*(?:all\s*)?services?/i,
      /(?:available|what)\s*services?/i,
      /(?:what|which)\s*(?:services?|do\s*you\s*offer)/i,
    ],
  },
  {
    intent: INTENTS.BUY_SERVICE,
    patterns: [
      /(?:buy|purchase|order|get)\s*(?:a\s*)?service/i,
      /(?:want|need)\s*(?:to\s*)?(?:buy|order|get)/i,
      /(?:how\s*(?:to|can\s*i))\s*(?:buy|purchase|order)/i,
    ],
  },
  {
    intent: INTENTS.DEAL_SERVICE,
    patterns: [
      /(?:deal|percentage|split)/i,
      /(?:revenue|profit)\s*(?:share|split)/i,
    ],
  },
  {
    intent: INTENTS.CUSTOM_SERVICE_REQUEST,
    patterns: [
      /(?:custom|special|specific)\s*(?:service|request)/i,
      /(?:service|platform)\s*(?:not\s*)?(?:listed|available)/i,
      /(?:can\s*you|do\s*you)\s*(?:make|create|build|offer)/i,
    ],
  },

  // ============ SUPPORT ============
  {
    intent: INTENTS.SUPPORT_TICKET,
    patterns: [
      /(?:create|open|submit|raise)\s*(?:a\s*)?(?:support\s*)?ticket/i,
      /(?:need|want)\s*(?:to\s*)?(?:report|submit)\s*(?:an?\s*)?(?:issue|problem)/i,
      /(?:contact|reach)\s*(?:support|help|team)/i,
    ],
  },
];

/**
 * Normalize text for pattern matching
 */
function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Classify user message to intent (deterministic, no LLM)
 * @param {string} text - User message
 * @returns {string} Intent from INTENTS enum
 */
function classifyIntent(text) {
  const msg = normalizeText(text);
  if (!msg) return INTENTS.UNKNOWN;

  // Check each pattern group in order
  for (const group of INTENT_PATTERNS) {
    for (const pattern of group.patterns) {
      if (pattern.test(msg)) {
        return group.intent;
      }
    }
  }

  return INTENTS.GENERAL_SUPPORT;
}

/**
 * Check if message is confused/unclear
 */
function isConfusedMessage(text) {
  const msg = normalizeText(text);
  return /(?:i\s*don\s*t\s*understand|what\s*do\s*you\s*mean|confused|unclear|huh\??|what\??|sorry\??)/.test(
    msg,
  );
}

/**
 * Check if intent is admin-only
 */
function isAdminIntent(intent) {
  return String(intent || "").startsWith("ADMIN_");
}

module.exports = {
  INTENTS,
  INTENT_PATTERNS,
  classifyIntent,
  isConfusedMessage,
  isAdminIntent,
  normalizeText,
};
