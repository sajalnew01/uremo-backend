/**
 * UREMO Tool Registry - Hardened Tool System
 *
 * ARCHITECTURE ENFORCEMENT:
 * - All tools registered with role requirements
 * - Core Brain is the ONLY caller of tools
 * - No direct tool execution from controller
 * - Role validation before every execution
 */

const Service = require("../models/Service");
const Order = require("../models/Order");
const WorkPosition = require("../models/WorkPosition");
const Ticket = require("../models/Ticket");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const Affiliate = require("../models/Affiliate");

// =============================================================================
// ROLE DEFINITIONS
// =============================================================================

const ROLES = {
  GUEST: "guest",
  USER: "user",
  ADMIN: "admin",
};

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

const TOOLS = {
  // =========================================================================
  // PUBLIC TOOLS (No auth required)
  // =========================================================================

  getServices: {
    name: "getServices",
    description: "List available services from the platform",
    allowedRoles: [ROLES.GUEST, ROLES.USER, ROLES.ADMIN],
    requiresAuth: false,
    execute: async (params = {}, context = {}) => {
      try {
        const { category, search, limit = 10 } = params;

        const query = { active: true };
        if (category) query.category = category;

        let services = await Service.find(query)
          .select("_id title price description imageUrl category slug")
          .sort({ sortOrder: 1, createdAt: -1 })
          .limit(Math.min(limit, 50))
          .lean();

        if (search) {
          const searchLower = search.toLowerCase();
          services = services.filter(
            (s) =>
              s.title?.toLowerCase().includes(searchLower) ||
              s.description?.toLowerCase().includes(searchLower),
          );
        }

        return {
          success: true,
          message: `Found ${services.length} services.`,
          data: services,
          actions: [
            {
              label: "Browse All",
              action: "NAVIGATE",
              url: "/explore-services",
            },
          ],
        };
      } catch (error) {
        return { success: false, message: "Unable to fetch services." };
      }
    },
  },

  getWorkPositions: {
    name: "getWorkPositions",
    description: "List available work positions",
    allowedRoles: [ROLES.GUEST, ROLES.USER, ROLES.ADMIN],
    requiresAuth: false,
    execute: async (params = {}, context = {}) => {
      try {
        const positions = await WorkPosition.find({ active: true })
          .select("_id title category description requirements")
          .sort({ sortOrder: 1, createdAt: -1 })
          .limit(20)
          .lean();

        return {
          success: true,
          message: `Found ${positions.length} work positions.`,
          data: positions,
          actions: [
            {
              label: "Apply to Work",
              action: "NAVIGATE",
              url: "/apply-to-work",
            },
          ],
        };
      } catch (error) {
        return { success: false, message: "Unable to fetch positions." };
      }
    },
  },

  // =========================================================================
  // USER TOOLS (Auth required)
  // =========================================================================

  getOrders: {
    name: "getOrders",
    description: "Get user's order history",
    allowedRoles: [ROLES.USER, ROLES.ADMIN],
    requiresAuth: true,
    execute: async (params = {}, context = {}) => {
      const { userId } = context;
      if (!userId) {
        return {
          success: false,
          message: "Authentication required.",
          code: "AUTH_REQUIRED",
        };
      }

      try {
        const { status, limit = 10 } = params;

        const query = { userId };
        if (status) query.status = status;

        const orders = await Order.find(query)
          .populate("serviceId", "title price")
          .sort({ createdAt: -1 })
          .limit(Math.min(limit, 50))
          .lean();

        const formatted = orders.map((o) => ({
          id: o._id,
          service: o.serviceId?.title || "Unknown",
          status: o.status,
          total: o.totalAmount,
          createdAt: o.createdAt,
        }));

        return {
          success: true,
          message: `You have ${orders.length} orders.`,
          data: formatted,
          actions: [
            { label: "View All Orders", action: "NAVIGATE", url: "/orders" },
          ],
        };
      } catch (error) {
        return { success: false, message: "Unable to fetch orders." };
      }
    },
  },

  getWallet: {
    name: "getWallet",
    description: "Get user's wallet balance and transactions",
    allowedRoles: [ROLES.USER, ROLES.ADMIN],
    requiresAuth: true,
    execute: async (params = {}, context = {}) => {
      const { userId } = context;
      if (!userId) {
        return {
          success: false,
          message: "Authentication required.",
          code: "AUTH_REQUIRED",
        };
      }

      try {
        const wallet = await Wallet.findOne({ userId }).lean();

        if (!wallet) {
          return {
            success: true,
            message: "Your wallet balance is 0.00 USD.",
            data: { balance: 0, affiliateBalance: 0 },
          };
        }

        const balance = wallet.balance || 0;
        const affiliateBalance = wallet.affiliateBalance || 0;

        return {
          success: true,
          message: `Wallet balance: ${balance.toFixed(2)} USD. Affiliate balance: ${affiliateBalance.toFixed(2)} USD.`,
          data: {
            balance,
            affiliateBalance,
            totalBalance: balance + affiliateBalance,
          },
          actions: [
            { label: "View Wallet", action: "NAVIGATE", url: "/wallet" },
          ],
        };
      } catch (error) {
        return { success: false, message: "Unable to fetch wallet." };
      }
    },
  },

  getAffiliateStatus: {
    name: "getAffiliateStatus",
    description: "Get user's affiliate earnings and referral info",
    allowedRoles: [ROLES.USER, ROLES.ADMIN],
    requiresAuth: true,
    execute: async (params = {}, context = {}) => {
      const { userId } = context;
      if (!userId) {
        return {
          success: false,
          message: "Authentication required.",
          code: "AUTH_REQUIRED",
        };
      }

      try {
        const affiliate = await Affiliate.findOne({ userId }).lean();
        const wallet = await Wallet.findOne({ userId }).lean();

        const referralCount = affiliate?.referrals?.length || 0;
        const totalEarnings = affiliate?.totalEarnings || 0;
        const affiliateBalance = wallet?.affiliateBalance || 0;

        return {
          success: true,
          message: `Referrals: ${referralCount}. Total earnings: ${totalEarnings.toFixed(2)} USD. Available: ${affiliateBalance.toFixed(2)} USD.`,
          data: {
            referralCount,
            totalEarnings,
            affiliateBalance,
            referralCode: affiliate?.referralCode || null,
          },
          actions: [
            {
              label: "Affiliate Dashboard",
              action: "NAVIGATE",
              url: "/affiliate",
            },
          ],
        };
      } catch (error) {
        return { success: false, message: "Unable to fetch affiliate info." };
      }
    },
  },

  createTicket: {
    name: "createTicket",
    description: "Create a support ticket",
    allowedRoles: [ROLES.USER, ROLES.ADMIN],
    requiresAuth: true,
    execute: async (params = {}, context = {}) => {
      const { userId } = context;
      if (!userId) {
        return {
          success: false,
          message: "Authentication required.",
          code: "AUTH_REQUIRED",
        };
      }

      try {
        const { subject, message } = params;

        if (!subject || !message) {
          return {
            success: false,
            message: "Subject and message are required.",
          };
        }

        // Generate ticket number
        const ticketNumber = `TKT-${Date.now().toString(36).toUpperCase()}`;

        const ticket = await Ticket.create({
          userId,
          ticketNumber,
          subject: String(subject).slice(0, 200),
          message: String(message).slice(0, 2000),
          status: "open",
          priority: "normal",
        });

        return {
          success: true,
          message: `Ticket ${ticketNumber} created successfully.`,
          data: { ticketNumber, ticketId: ticket._id },
          actions: [
            { label: "View Tickets", action: "NAVIGATE", url: "/support" },
          ],
        };
      } catch (error) {
        return { success: false, message: "Unable to create ticket." };
      }
    },
  },

  // =========================================================================
  // ADMIN TOOLS (Admin only)
  // =========================================================================

  getAdminStats: {
    name: "getAdminStats",
    description: "Get platform-wide admin statistics",
    allowedRoles: [ROLES.ADMIN],
    requiresAuth: true,
    execute: async (params = {}, context = {}) => {
      try {
        const [
          totalUsers,
          totalOrders,
          pendingOrders,
          totalServices,
          activeServices,
          openTickets,
        ] = await Promise.all([
          User.countDocuments({}),
          Order.countDocuments({}),
          Order.countDocuments({
            status: { $in: ["pending", "waiting_user", "in_progress"] },
          }),
          Service.countDocuments({}),
          Service.countDocuments({ active: true }),
          Ticket.countDocuments({ status: "open" }),
        ]);

        return {
          success: true,
          message: `Platform stats: ${totalUsers} users, ${totalOrders} orders (${pendingOrders} pending), ${activeServices}/${totalServices} services active, ${openTickets} open tickets.`,
          data: {
            totalUsers,
            totalOrders,
            pendingOrders,
            totalServices,
            activeServices,
            openTickets,
          },
          actions: [
            { label: "Admin Dashboard", action: "NAVIGATE", url: "/admin" },
          ],
        };
      } catch (error) {
        return { success: false, message: "Unable to fetch stats." };
      }
    },
  },

  getAdminPendingOrders: {
    name: "getAdminPendingOrders",
    description: "Get pending orders for admin review",
    allowedRoles: [ROLES.ADMIN],
    requiresAuth: true,
    execute: async (params = {}, context = {}) => {
      try {
        const orders = await Order.find({
          status: { $in: ["pending", "waiting_user", "in_progress"] },
        })
          .populate("userId", "email name")
          .populate("serviceId", "title")
          .sort({ createdAt: -1 })
          .limit(20)
          .lean();

        const formatted = orders.map((o) => ({
          id: o._id,
          user: o.userId?.email || "Unknown",
          service: o.serviceId?.title || "Unknown",
          status: o.status,
          total: o.totalAmount,
          createdAt: o.createdAt,
        }));

        return {
          success: true,
          message: `Found ${orders.length} pending orders.`,
          data: formatted,
          actions: [
            {
              label: "Manage Orders",
              action: "NAVIGATE",
              url: "/admin/orders",
            },
          ],
        };
      } catch (error) {
        return { success: false, message: "Unable to fetch pending orders." };
      }
    },
  },

  getAdminPendingProofs: {
    name: "getAdminPendingProofs",
    description: "Get orders with pending payment proofs",
    allowedRoles: [ROLES.ADMIN],
    requiresAuth: true,
    execute: async (params = {}, context = {}) => {
      try {
        const orders = await Order.find({
          status: "waiting_user",
          "payment.proofUrl": { $exists: true, $ne: "" },
          "payment.verifiedAt": { $in: [null, undefined] },
        })
          .populate("userId", "email name")
          .populate("serviceId", "title")
          .sort({ createdAt: -1 })
          .limit(20)
          .lean();

        const formatted = orders.map((o) => ({
          id: o._id,
          user: o.userId?.email || "Unknown",
          service: o.serviceId?.title || "Unknown",
          proofUrl: o.payment?.proofUrl,
          createdAt: o.createdAt,
        }));

        return {
          success: true,
          message: `Found ${orders.length} orders with pending proofs.`,
          data: formatted,
          actions: [
            {
              label: "Review Proofs",
              action: "NAVIGATE",
              url: "/admin/orders?filter=proof",
            },
          ],
        };
      } catch (error) {
        return { success: false, message: "Unable to fetch pending proofs." };
      }
    },
  },

  createService: {
    name: "createService",
    description: "Create a new service listing",
    allowedRoles: [ROLES.ADMIN],
    requiresAuth: true,
    execute: async (params = {}, context = {}) => {
      try {
        const {
          title,
          price,
          category = "microjobs",
          description = "",
        } = params;

        if (!title || price === undefined) {
          return { success: false, message: "Title and price are required." };
        }

        // Generate slug
        const slug =
          String(title)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") +
          "-" +
          Date.now().toString(36);

        const service = await Service.create({
          title: String(title).slice(0, 200),
          price: Number(price),
          category,
          description: String(description).slice(0, 2000),
          slug,
          active: true,
        });

        return {
          success: true,
          message: `Service "${title}" created successfully with ID ${service._id}.`,
          data: { serviceId: service._id, slug },
          actions: [
            {
              label: "View Service",
              action: "NAVIGATE",
              url: `/admin/services/${service._id}`,
            },
          ],
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to create service: ${error.message}`,
        };
      }
    },
  },

  updateOrderStatus: {
    name: "updateOrderStatus",
    description: "Update an order's status",
    allowedRoles: [ROLES.ADMIN],
    requiresAuth: true,
    execute: async (params = {}, context = {}) => {
      try {
        const { orderId, status } = params;

        if (!orderId || !status) {
          return {
            success: false,
            message: "Order ID and status are required.",
          };
        }

        const validStatuses = [
          "pending",
          "in_progress",
          "waiting_user",
          "completed",
          "cancelled",
        ];
        if (!validStatuses.includes(status)) {
          return {
            success: false,
            message: `Invalid status. Valid options: ${validStatuses.join(", ")}`,
          };
        }

        const order = await Order.findByIdAndUpdate(
          orderId,
          { status, updatedAt: new Date() },
          { new: true },
        );

        if (!order) {
          return { success: false, message: "Order not found." };
        }

        return {
          success: true,
          message: `Order ${orderId} status updated to "${status}".`,
          data: { orderId, status: order.status },
          actions: [
            {
              label: "View Order",
              action: "NAVIGATE",
              url: `/admin/orders/${orderId}`,
            },
          ],
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to update order: ${error.message}`,
        };
      }
    },
  },

  approvePaymentProof: {
    name: "approvePaymentProof",
    description: "Approve a payment proof for an order",
    allowedRoles: [ROLES.ADMIN],
    requiresAuth: true,
    execute: async (params = {}, context = {}) => {
      try {
        const { orderId } = params;

        if (!orderId) {
          return { success: false, message: "Order ID is required." };
        }

        const order = await Order.findByIdAndUpdate(
          orderId,
          {
            status: "in_progress",
            "payment.verifiedAt": new Date(),
            "payment.verifiedBy": context.userId,
            updatedAt: new Date(),
          },
          { new: true },
        );

        if (!order) {
          return { success: false, message: "Order not found." };
        }

        return {
          success: true,
          message: `Payment proof for order ${orderId} approved. Order is now in progress.`,
          data: { orderId, status: order.status },
          actions: [
            {
              label: "View Order",
              action: "NAVIGATE",
              url: `/admin/orders/${orderId}`,
            },
          ],
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to approve proof: ${error.message}`,
        };
      }
    },
  },
};

// =============================================================================
// REGISTRY FUNCTIONS
// =============================================================================

/**
 * Get tool by name
 * @param {string} name - Tool name
 * @returns {object|null} Tool definition or null
 */
function getToolByName(name) {
  return TOOLS[name] || null;
}

/**
 * Validate if role can access tool
 * @param {string} toolName - Tool name
 * @param {string} role - User role
 * @returns {object} { allowed: boolean, reason?: string }
 */
function validateToolAccess(toolName, role) {
  const tool = TOOLS[toolName];

  if (!tool) {
    return { allowed: false, reason: "Unknown tool." };
  }

  const normalizedRole = String(role || "guest").toLowerCase();

  if (!tool.allowedRoles.includes(normalizedRole)) {
    if (tool.allowedRoles.includes(ROLES.ADMIN)) {
      return {
        allowed: false,
        reason: "This action requires administrator privileges.",
      };
    }
    if (tool.allowedRoles.includes(ROLES.USER)) {
      return {
        allowed: false,
        reason: "Please log in to access this feature.",
      };
    }
    return { allowed: false, reason: "Access denied." };
  }

  return { allowed: true };
}

/**
 * Get all tools available for a role
 * @param {string} role - User role
 * @returns {object[]} Available tools
 */
function getToolsForRole(role) {
  const normalizedRole = String(role || "guest").toLowerCase();

  return Object.values(TOOLS)
    .filter((tool) => tool.allowedRoles.includes(normalizedRole))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      requiresAuth: tool.requiresAuth,
    }));
}

/**
 * Get list of all tool names
 * @returns {string[]} Tool names
 */
function getAllToolNames() {
  return Object.keys(TOOLS);
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  TOOLS,
  ROLES,
  getToolByName,
  validateToolAccess,
  getToolsForRole,
  getAllToolNames,
};
