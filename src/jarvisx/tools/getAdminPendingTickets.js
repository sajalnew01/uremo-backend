/**
 * PATCH_51: Get Admin Pending Tickets Tool
 * Returns list of open support tickets
 */

const Ticket = require("../../models/Ticket");

/**
 * Get pending/open tickets for admin
 * @param {Object} params - { limit }
 * @param {Object} context - { userId, userRole, isAdmin }
 * @returns {Promise<Object>}
 */
async function getAdminPendingTickets(params, context) {
  if (!context.isAdmin) {
    return {
      error: "Admin access required",
      code: "ADMIN_REQUIRED",
    };
  }

  const limit = Math.min(params.limit || 10, 50);

  try {
    const tickets = await Ticket.find({
      status: { $in: ["open", "pending", "waiting_reply"] },
    })
      .populate("userId", "name email")
      .sort({ priority: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    const count = await Ticket.countDocuments({
      status: { $in: ["open", "pending", "waiting_reply"] },
    });

    return {
      data: {
        tickets: tickets.map((t) => ({
          id: t._id,
          user: t.userId?.name || "Unknown",
          userEmail: t.userId?.email || "",
          subject: t.subject || "No Subject",
          priority: t.priority || "normal",
          status: t.status,
          createdAt: t.createdAt,
        })),
        count,
        hasMore: count > limit,
      },
      message: `Found ${count} open tickets`,
    };
  } catch (err) {
    console.error("[getAdminPendingTickets] Error:", err.message);
    return {
      error: "Failed to fetch pending tickets",
      code: "FETCH_ERROR",
    };
  }
}

module.exports = getAdminPendingTickets;
