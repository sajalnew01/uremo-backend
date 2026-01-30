/**
 * PATCH_51: Get Admin Dashboard Stats Tool
 * Returns platform-wide statistics for admin dashboard
 */

const Order = require("../../models/Order");
const User = require("../../models/User");
const Ticket = require("../../models/Ticket");
const ProofOfWork = require("../../models/ProofOfWork");
const Service = require("../../models/Service");
const WorkPosition = require("../../models/WorkPosition");
const WorkerApplication = require("../../models/WorkerApplication");

/**
 * Get admin dashboard stats
 * @param {Object} params - {}
 * @param {Object} context - { userId, userRole, isAdmin }
 * @returns {Promise<Object>}
 */
async function getAdminStats(params, context) {
  if (!context.isAdmin) {
    return {
      error: "Admin access required",
      code: "ADMIN_REQUIRED",
    };
  }

  try {
    const [
      pendingOrders,
      totalOrders,
      pendingProofs,
      openTickets,
      totalUsers,
      activeServices,
      activePositions,
      pendingApplications,
    ] = await Promise.all([
      Order.countDocuments({ status: "pending" }),
      Order.countDocuments({}),
      ProofOfWork.countDocuments({ status: "pending" }),
      Ticket.countDocuments({ status: { $in: ["open", "pending"] } }),
      User.countDocuments({}),
      Service.countDocuments({ active: true }),
      WorkPosition.countDocuments({ active: true }),
      WorkerApplication.countDocuments({ applicationStatus: "pending" }),
    ]);

    return {
      data: {
        pendingOrders,
        totalOrders,
        pendingProofs,
        openTickets,
        totalUsers,
        activeServices,
        activePositions,
        pendingApplications,
      },
      message: "Dashboard stats retrieved successfully",
    };
  } catch (err) {
    console.error("[getAdminStats] Error:", err.message);
    return {
      error: "Failed to fetch admin stats",
      code: "FETCH_ERROR",
    };
  }
}

module.exports = getAdminStats;
