/**
 * PATCH_51: Get Admin Pending Orders Tool
 * Returns list of orders awaiting verification
 */

const Order = require("../../models/Order");

/**
 * Get pending orders for admin
 * @param {Object} params - { limit }
 * @param {Object} context - { userId, userRole, isAdmin }
 * @returns {Promise<Object>}
 */
async function getAdminPendingOrders(params, context) {
  if (!context.isAdmin) {
    return {
      error: "Admin access required",
      code: "ADMIN_REQUIRED",
    };
  }

  const limit = Math.min(params.limit || 10, 50);

  try {
    const orders = await Order.find({ status: "pending" })
      .populate("userId", "name email")
      .populate("serviceId", "title price")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const count = await Order.countDocuments({ status: "pending" });

    return {
      data: {
        orders: orders.map((o) => ({
          id: o._id,
          user: o.userId?.name || "Unknown",
          userEmail: o.userId?.email || "",
          service: o.serviceId?.title || "Unknown Service",
          price: o.serviceId?.price || 0,
          createdAt: o.createdAt,
          hasPaymentProof: !!o.payment?.proofUrl,
        })),
        count,
        hasMore: count > limit,
      },
      message: `Found ${count} pending orders`,
    };
  } catch (err) {
    console.error("[getAdminPendingOrders] Error:", err.message);
    return {
      error: "Failed to fetch pending orders",
      code: "FETCH_ERROR",
    };
  }
}

module.exports = getAdminPendingOrders;
