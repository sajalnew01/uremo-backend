/**
 * PATCH_36: JarvisX Intent Router
 * Maps user messages to tools using pattern matching
 * Returns tool name + extracted parameters if match found
 */

/**
 * Intent patterns - ordered by specificity (most specific first)
 */
const INTENT_PATTERNS = [
  // ============ TICKET CREATION ============
  {
    tool: "createTicket",
    patterns: [
      /(?:create|open|submit|file|raise)\s*(?:a\s*)?(?:support\s*)?ticket/i,
      /(?:need|want)\s*(?:to\s*)?(?:report|submit)\s*(?:a\s*)?(?:issue|problem|bug)/i,
      /(?:i\s*have\s*(?:a\s*)?(?:issue|problem|complaint))/i,
      /(?:contact|reach)\s*(?:support|help|team)/i,
      /(?:help|support)\s*(?:ticket|request)/i,
    ],
    extractParams: (text) => {
      // Try to extract subject from "about X" or "regarding X"
      const aboutMatch = text.match(/(?:about|regarding|for)\s+(.+?)(?:\.|$)/i);
      return {
        subject: aboutMatch
          ? aboutMatch[1].trim().slice(0, 100)
          : "Support Request",
        message: text.slice(0, 500),
      };
    },
  },

  // ============ ORDER QUERIES ============
  {
    tool: "getOrders",
    patterns: [
      /(?:show|get|list|view|check|see)\s*(?:my\s*)?orders?/i,
      /(?:my|all)\s*orders?/i,
      /(?:order|purchase)\s*(?:history|status|list)/i,
      /(?:what|which)\s*(?:orders?|purchases?)\s*(?:do\s*i\s*have|have\s*i)/i,
      /(?:pending|completed|active)\s*orders?/i,
      /(?:track|check)\s*(?:my\s*)?(?:order|purchase)/i,
    ],
    extractParams: (text) => {
      // Extract status filter
      const statusMatch = text.match(
        /(?:pending|completed|processing|rejected|approved|review)/i,
      );
      return {
        status: statusMatch ? statusMatch[0].toLowerCase() : undefined,
        limit: 10,
      };
    },
  },

  // ============ WALLET QUERIES ============
  {
    tool: "getWallet",
    patterns: [
      /(?:show|get|check|see|view)\s*(?:my\s*)?(?:wallet|balance)/i,
      /(?:my|current)\s*(?:wallet|balance)/i,
      /(?:wallet|account)\s*(?:balance|status|info)/i,
      /(?:how\s*much)\s*(?:money|balance|funds?)\s*(?:do\s*i\s*have|in\s*my)/i,
      /(?:affiliate|referral)\s*(?:balance|earnings|money)/i,
      /(?:transaction|spending)\s*history/i,
    ],
    extractParams: () => ({ limit: 5 }),
  },

  // ============ SERVICE QUERIES ============
  {
    tool: "getServices",
    patterns: [
      /(?:show|get|list|view|browse|see)\s*(?:all\s*)?services?/i,
      /(?:available|active)\s*services?/i,
      /(?:what|which)\s*services?\s*(?:do\s*you\s*(?:have|offer)|are\s*available)/i,
      /(?:find|search)\s*(?:a\s*)?service/i,
      /(?:microjobs?|forex|crypto|bank|gateway|wallet)\s*services?/i,
      /(?:services?\s*(?:for|in|about)\s*)/i,
    ],
    extractParams: (text) => {
      // Extract category
      let category;
      if (/micro(?:job)?s?/i.test(text)) category = "microjobs";
      else if (/forex|crypto/i.test(text)) category = "forex_crypto";
      else if (/bank|gateway|wallet/i.test(text))
        category = "banks_gateways_wallets";

      // Extract search term
      const searchMatch = text.match(
        /(?:search|find|look\s*for|about)\s+["']?([^"'\n]+)["']?/i,
      );

      return {
        category,
        search: searchMatch ? searchMatch[1].trim() : undefined,
        limit: 10,
      };
    },
  },

  // ============ RENTAL QUERIES ============
  {
    tool: "getRentals",
    patterns: [
      /(?:show|get|list|view|check|see)\s*(?:my\s*)?rentals?/i,
      /(?:my|active)\s*rentals?/i,
      /(?:rental|subscription)\s*(?:status|history|list)/i,
      /(?:what|which)\s*rentals?\s*(?:do\s*i\s*have|have\s*i)/i,
      /(?:expiring|active|expired)\s*rentals?/i,
    ],
    extractParams: (text) => {
      const statusMatch = text.match(
        /(?:active|expired|pending|cancelled|renewed)/i,
      );
      return {
        status: statusMatch ? statusMatch[0].toLowerCase() : undefined,
        limit: 10,
      };
    },
  },

  // ============ ADMIN: CREATE SERVICE ============
  {
    tool: "createService",
    adminOnly: true,
    patterns: [
      /(?:create|add|make)\s*(?:a\s*)?(?:new\s*)?service/i,
      /(?:new|add)\s*service\s*(?:called|named|titled)/i,
      /(?:list|publish)\s*(?:a\s*)?(?:new\s*)?service/i,
    ],
    extractParams: (text) => {
      // Try to extract title
      const titleMatch = text.match(
        /(?:called|named|titled|:)\s*["']?([^"'\n,]+)["']?/i,
      );
      // Try to extract price
      const priceMatch = text.match(
        /(?:price|cost|for|\$|at)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i,
      );
      // Try to extract category
      let category = "general";
      if (/micro(?:job)?s?/i.test(text)) category = "microjobs";
      else if (/forex|crypto/i.test(text)) category = "forex_crypto";
      else if (/bank|gateway|wallet/i.test(text))
        category = "banks_gateways_wallets";

      return {
        title: titleMatch ? titleMatch[1].trim() : undefined,
        price: priceMatch ? parseFloat(priceMatch[1]) : undefined,
        category,
        description: text.slice(0, 500),
      };
    },
  },

  // ============ ADMIN: UPDATE ORDER ============
  {
    tool: "updateOrderStatus",
    adminOnly: true,
    patterns: [
      /(?:update|change|set|mark)\s*order\s*(?:status|as|to)/i,
      /(?:approve|reject|complete|process)\s*(?:the\s*)?order/i,
      /order\s*(?:[a-f0-9]{24})\s*(?:to|as|status)/i,
      /(?:mark|set)\s*(?:order\s*)?(?:[a-f0-9]{24})\s*(?:as|to)/i,
    ],
    extractParams: (text) => {
      // Extract order ID (MongoDB ObjectId format)
      const idMatch = text.match(/([a-f0-9]{24})/i);

      // Extract status
      let status;
      if (/approv/i.test(text)) status = "approved";
      else if (/reject/i.test(text)) status = "rejected";
      else if (/complet/i.test(text)) status = "completed";
      else if (/process/i.test(text)) status = "processing";
      else if (/review/i.test(text)) status = "review";
      else if (/pending/i.test(text)) status = "pending";

      // Extract note
      const noteMatch = text.match(
        /(?:note|reason|because|with\s*note)[:\s]+["']?([^"'\n]+)["']?/i,
      );

      return {
        orderId: idMatch ? idMatch[1] : undefined,
        status,
        note: noteMatch ? noteMatch[1].trim() : undefined,
      };
    },
  },
];

/**
 * Route a message to a tool
 * @param {string} message - User's message
 * @param {Object} context - { userId, userRole, isAdmin }
 * @returns {Object|null} - { tool, params } or null if no match
 */
function routeToTool(message, context = {}) {
  if (!message || typeof message !== "string") {
    return null;
  }

  const normalizedMessage = message.trim();

  for (const intent of INTENT_PATTERNS) {
    // Skip admin-only tools for non-admins
    if (intent.adminOnly && !context.isAdmin) {
      continue;
    }

    // Check if any pattern matches
    const matched = intent.patterns.some((pattern) =>
      pattern.test(normalizedMessage),
    );

    if (matched) {
      const params = intent.extractParams
        ? intent.extractParams(normalizedMessage)
        : {};

      return {
        tool: intent.tool,
        params,
        confidence: 0.85, // Pattern-based matching confidence
      };
    }
  }

  return null;
}

/**
 * Get suggested tools for a context
 * @param {Object} context - { isAdmin }
 * @returns {Array<string>} - Tool names
 */
function getSuggestedTools(context = {}) {
  const userTools = [
    "createTicket",
    "getOrders",
    "getWallet",
    "getServices",
    "getRentals",
  ];

  if (context.isAdmin) {
    return [...userTools, "createService", "updateOrderStatus"];
  }

  return userTools;
}

/**
 * Get quick actions for context
 */
function getQuickActions(context = {}) {
  const actions = [
    { label: "My Orders", tool: "getOrders" },
    { label: "My Wallet", tool: "getWallet" },
    { label: "Browse Services", tool: "getServices" },
    { label: "Create Ticket", tool: "createTicket" },
  ];

  if (context.isAdmin) {
    actions.push(
      { label: "Add Service", tool: "createService" },
      { label: "Update Order", tool: "updateOrderStatus" },
    );
  }

  return actions;
}

module.exports = {
  routeToTool,
  getSuggestedTools,
  getQuickActions,
  INTENT_PATTERNS,
};
