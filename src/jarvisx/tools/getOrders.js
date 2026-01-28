/**
 * PATCH_36: getOrders Tool
 * Retrieves the user's order history
 */

const Order = require("../../models/Order");

/**
 * Get user's orders
 * @param {Object} params - { limit, status }
 * @param {Object} context - { userId, userRole, isAdmin }
 * @returns {Promise<Object>}
 */
async function getOrders(params, context) {
  const { limit = 10, status } = params;
  const { userId } = context;

  const query = { userId };

  // Filter by status if provided
  if (status && typeof status === "string") {
    const validStatuses = [
      "pending",
      "in_progress",
      "waiting_user",
      "completed",
      "cancelled",
    ];
    if (validStatuses.includes(status.toLowerCase())) {
      query.status = status.toLowerCase();
    }
  }

  const orders = await Order.find(query)
    .populate("serviceId", "title price imageUrl")
    .sort({ createdAt: -1 })
    .limit(Math.min(parseInt(limit) || 10, 20))
    .lean();

  if (!orders || orders.length === 0) {
    return {
      data: [],
      message:
        "You don't have any orders yet. Browse our services to get started!",
    };
  }

  const formatted = orders.map((o) => ({
    orderId: o._id,
    service: o.serviceId?.title || "Unknown Service",
    price: o.serviceId?.price || 0,
    status: o.status,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    completedAt: o.completedAt,
  }));

  // PATCH_37: Summary stats with normalized statuses
  const totalOrders = orders.length;
  const completed = orders.filter((o) => o.status === "completed").length;
  const inProgress = orders.filter((o) =>
    ["pending", "in_progress", "waiting_user"].includes(o.status),
  ).length;
  const cancelled = orders.filter((o) => o.status === "cancelled").length;

  return {
    data: formatted,
    summary: {
      total: totalOrders,
      completed,
      inProgress,
      cancelled,
    },
    message: `Found ${totalOrders} orders: ${completed} completed, ${inProgress} in progress.`,
  };
}

module.exports = getOrders;
