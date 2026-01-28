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
      "payment_pending",
      "payment_submitted",
      "review",
      "processing",
      "pending_review",
      "assistance_required",
      "approved",
      "completed",
      "rejected",
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

  // Summary stats
  const totalOrders = orders.length;
  const completed = orders.filter((o) => o.status === "completed").length;
  const pending = orders.filter((o) =>
    ["pending", "processing", "review", "payment_submitted"].includes(o.status),
  ).length;

  return {
    data: formatted,
    summary: {
      total: totalOrders,
      completed,
      pending,
      rejected: orders.filter((o) => o.status === "rejected").length,
    },
    message: `Found ${totalOrders} orders: ${completed} completed, ${pending} in progress.`,
  };
}

module.exports = getOrders;
