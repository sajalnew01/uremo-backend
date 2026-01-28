/**
 * PATCH_36: JarvisX Tool Registry
 * Central registry for all JarvisX tools that execute real platform actions
 * Tools are mapped by name and include metadata for routing
 */

const createTicket = require("./createTicket");
const getOrders = require("./getOrders");
const getWallet = require("./getWallet");
const getServices = require("./getServices");
const getRentals = require("./getRentals");
const createService = require("./createService");
const updateOrderStatus = require("./updateOrderStatus");

// Tool definitions with metadata
const TOOLS = {
  // ============ USER TOOLS ============
  createTicket: {
    name: "createTicket",
    description: "Create a support ticket for the user",
    requiresAuth: true,
    adminOnly: false,
    execute: createTicket,
  },
  getOrders: {
    name: "getOrders",
    description: "Get user's order history",
    requiresAuth: true,
    adminOnly: false,
    execute: getOrders,
  },
  getWallet: {
    name: "getWallet",
    description: "Get user's wallet balance and recent transactions",
    requiresAuth: true,
    adminOnly: false,
    execute: getWallet,
  },
  getServices: {
    name: "getServices",
    description: "List available services from the platform",
    requiresAuth: false,
    adminOnly: false,
    execute: getServices,
  },
  getRentals: {
    name: "getRentals",
    description: "Get user's active rentals",
    requiresAuth: true,
    adminOnly: false,
    execute: getRentals,
  },

  // ============ ADMIN TOOLS ============
  createService: {
    name: "createService",
    description: "Create a new service listing (admin only)",
    requiresAuth: true,
    adminOnly: true,
    execute: createService,
  },
  updateOrderStatus: {
    name: "updateOrderStatus",
    description: "Update an order's status (admin only)",
    requiresAuth: true,
    adminOnly: true,
    execute: updateOrderStatus,
  },
};

/**
 * Get all tool names
 */
function getToolNames() {
  return Object.keys(TOOLS);
}

/**
 * Get tool by name
 */
function getTool(name) {
  return TOOLS[name] || null;
}

/**
 * Get user-accessible tools (excludes admin-only)
 */
function getUserTools() {
  return Object.values(TOOLS).filter((t) => !t.adminOnly);
}

/**
 * Get admin-only tools
 */
function getAdminTools() {
  return Object.values(TOOLS).filter((t) => t.adminOnly);
}

/**
 * Execute a tool with context
 * @param {string} toolName - Tool identifier
 * @param {Object} params - Tool parameters
 * @param {Object} context - { userId, userRole, isAdmin }
 * @returns {Promise<Object>} - { success, data, message }
 */
async function executeTool(toolName, params, context) {
  const tool = TOOLS[toolName];

  if (!tool) {
    return {
      success: false,
      error: `Tool "${toolName}" not found`,
      code: "TOOL_NOT_FOUND",
    };
  }

  // Check auth requirement
  if (tool.requiresAuth && !context.userId) {
    return {
      success: false,
      error: "Authentication required for this action",
      code: "AUTH_REQUIRED",
    };
  }

  // Check admin requirement
  if (tool.adminOnly && !context.isAdmin) {
    return {
      success: false,
      error: "Admin access required for this action",
      code: "ADMIN_REQUIRED",
    };
  }

  try {
    const result = await tool.execute(params, context);
    return {
      success: true,
      toolName,
      ...result,
    };
  } catch (err) {
    console.error(`[JarvisX Tool Error] ${toolName}:`, err.message);
    return {
      success: false,
      error: err.message || "Tool execution failed",
      code: "EXECUTION_ERROR",
    };
  }
}

module.exports = {
  TOOLS,
  getToolNames,
  getTool,
  getUserTools,
  getAdminTools,
  executeTool,
};
