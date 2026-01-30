/**
 * PATCH_51: JarvisX Role Policy Guard
 * Controls which intents each role can access
 * Prevents admin data leakage to regular users
 */

const { INTENTS, isAdminIntent } = require("./intents");

/**
 * Role hierarchy
 */
const ROLES = {
  GUEST: "guest",
  USER: "user",
  ADMIN: "admin",
};

/**
 * Intents that require authentication
 */
const AUTH_REQUIRED_INTENTS = new Set([
  INTENTS.MY_ORDERS,
  INTENTS.ORDER_STATUS,
  INTENTS.ORDER_HELP,
  INTENTS.MY_RENTALS,
  INTENTS.RENTAL_HELP,
  INTENTS.WALLET_BALANCE,
  INTENTS.WALLET_TOPUP,
  INTENTS.WALLET_HISTORY,
  INTENTS.WORKSPACE_STATUS,
  INTENTS.SCREENING_HELP,
  INTENTS.PROJECT_HELP,
  INTENTS.EARNINGS_STATUS,
  INTENTS.AFFILIATE_STATUS,
  INTENTS.AFFILIATE_LINK,
  INTENTS.SUPPORT_TICKET,
  // All admin intents require auth
  INTENTS.ADMIN_DASHBOARD,
  INTENTS.ADMIN_PENDING_ORDERS,
  INTENTS.ADMIN_PENDING_PROOFS,
  INTENTS.ADMIN_PENDING_TICKETS,
  INTENTS.ADMIN_USER_LOOKUP,
  INTENTS.ADMIN_SERVICE_MANAGE,
  INTENTS.ADMIN_CREATE_SERVICE,
  INTENTS.ADMIN_CREATE_PROJECT,
]);

/**
 * Intents allowed for guests (unauthenticated users)
 */
const GUEST_ALLOWED_INTENTS = new Set([
  INTENTS.GREETING,
  INTENTS.UNKNOWN,
  INTENTS.CONFUSED,
  INTENTS.CANCEL,
  INTENTS.CONFIRM,
  INTENTS.EXPLORE_SERVICES,
  INTENTS.SERVICE_DETAILS,
  INTENTS.BUY_SERVICE,
  INTENTS.RENT_SERVICE,
  INTENTS.DEAL_SERVICE,
  INTENTS.APPLY_TO_WORK,
  INTENTS.CUSTOM_SERVICE_REQUEST,
  INTENTS.GENERAL_SUPPORT,
]);

/**
 * Check if a role can access an intent
 * @param {string} role - "guest" | "user" | "admin"
 * @param {string} intent - Intent from INTENTS enum
 * @returns {{ allowed: boolean, reason?: string, redirectTo?: string }}
 */
function allowIntent(role, intent) {
  const normalizedRole = String(role || "guest").toLowerCase();
  const normalizedIntent = String(intent || "UNKNOWN");

  // Admin can access everything
  if (normalizedRole === ROLES.ADMIN) {
    return { allowed: true };
  }

  // Block admin intents for non-admins
  if (isAdminIntent(normalizedIntent)) {
    return {
      allowed: false,
      reason: "This feature is only available to administrators.",
      code: "ADMIN_ONLY",
    };
  }

  // Check if intent requires authentication
  if (AUTH_REQUIRED_INTENTS.has(normalizedIntent)) {
    if (normalizedRole === ROLES.GUEST) {
      return {
        allowed: false,
        reason: "Please log in to access this feature.",
        code: "AUTH_REQUIRED",
        redirectTo: "/login",
      };
    }
  }

  // Guest role - check allowed list
  if (normalizedRole === ROLES.GUEST) {
    if (!GUEST_ALLOWED_INTENTS.has(normalizedIntent)) {
      return {
        allowed: false,
        reason: "Please log in to access this feature.",
        code: "AUTH_REQUIRED",
        redirectTo: "/login",
      };
    }
  }

  // User role - everything except admin
  return { allowed: true };
}

/**
 * Get user's effective role
 * @param {Object} context - { userId, userRole, isAdmin }
 * @returns {string} Role string
 */
function getEffectiveRole(context) {
  if (!context) return ROLES.GUEST;
  if (context.isAdmin || context.userRole === "admin") return ROLES.ADMIN;
  if (context.userId) return ROLES.USER;
  return ROLES.GUEST;
}

/**
 * Generate policy denial response
 */
function getDenialResponse(policyResult, intent) {
  const response = {
    success: false,
    intent,
    blocked: true,
    code: policyResult.code || "BLOCKED",
    reply: policyResult.reason || "You're not authorized for this action.",
    actions: [],
  };

  if (policyResult.redirectTo) {
    response.actions.push({
      label: "Log In",
      action: "NAVIGATE",
      url: policyResult.redirectTo,
    });
  }

  return response;
}

module.exports = {
  ROLES,
  allowIntent,
  getEffectiveRole,
  getDenialResponse,
  AUTH_REQUIRED_INTENTS,
  GUEST_ALLOWED_INTENTS,
};
