/**
 * PATCH_36: updateOrderStatus Tool (Admin Only)
 * Updates an order's status with timeline logging
 */

const Order = require("../../models/Order");

/**
 * Update order status
 * @param {Object} params - { orderId, status, note }
 * @param {Object} context - { userId, userRole, isAdmin }
 * @returns {Promise<Object>}
 */
async function updateOrderStatus(params, context) {
  const { orderId, status, note } = params;

  if (!orderId) {
    return {
      data: null,
      message: "Order ID is required",
    };
  }

  if (!status) {
    return {
      data: null,
      message: "New status is required",
    };
  }

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

  const normalizedStatus = String(status).toLowerCase();
  if (!validStatuses.includes(normalizedStatus)) {
    return {
      data: null,
      message: `Invalid status. Valid options: ${validStatuses.join(", ")}`,
    };
  }

  const order = await Order.findById(orderId).populate(
    "serviceId",
    "title price",
  );

  if (!order) {
    return {
      data: null,
      message: `Order ${orderId} not found`,
    };
  }

  const previousStatus = order.status;

  // Update status
  order.status = normalizedStatus;

  // Add to status log
  order.statusLog = order.statusLog || [];
  order.statusLog.push({
    text: `Status changed from ${previousStatus} to ${normalizedStatus}${
      note ? `: ${note}` : ""
    }`,
    at: new Date(),
  });

  // Add to timeline
  order.timeline = order.timeline || [];
  order.timeline.push({
    message: `Order ${normalizedStatus}${note ? ` - ${note}` : ""}`,
    by: "admin",
    createdAt: new Date(),
  });

  // Set completed timestamp if applicable
  if (normalizedStatus === "completed" && !order.completedAt) {
    order.completedAt = new Date();
  }

  await order.save();

  return {
    data: {
      orderId: order._id,
      service: order.serviceId?.title || "Unknown",
      previousStatus,
      newStatus: normalizedStatus,
      updatedAt: new Date(),
    },
    message: `Order updated: ${previousStatus} → ${normalizedStatus}`,
    action: {
      type: "order_updated",
      url: `/admin/orders/${order._id}`,
    },
  };
}

module.exports = updateOrderStatus;
