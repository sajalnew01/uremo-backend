/**
 * PATCH_36: createTicket Tool
 * Creates a support ticket for the authenticated user
 */

const Ticket = require("../../models/Ticket");

/**
 * Create a support ticket
 * @param {Object} params - { subject, message, priority, category }
 * @param {Object} context - { userId, userRole, isAdmin }
 * @returns {Promise<Object>}
 */
async function createTicket(params, context) {
  const {
    subject,
    message,
    priority = "medium",
    category = "general",
  } = params;
  const { userId } = context;

  if (!subject || !message) {
    return {
      data: null,
      message: "Subject and message are required to create a ticket",
    };
  }

  // Generate ticket number
  const ticketCount = await Ticket.countDocuments();
  const ticketNumber = `TKT-${String(ticketCount + 1).padStart(6, "0")}`;

  const ticket = await Ticket.create({
    user: userId,
    ticketNumber,
    subject: String(subject).trim().slice(0, 200),
    message: String(message).trim().slice(0, 2000),
    priority: ["low", "medium", "high", "urgent"].includes(priority)
      ? priority
      : "medium",
    category: ["general", "payment", "order", "technical", "account"].includes(
      category,
    )
      ? category
      : "general",
    status: "open",
  });

  return {
    data: {
      ticketId: ticket._id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
    },
    message: `Support ticket ${ticket.ticketNumber} created successfully. Our team will respond shortly.`,
  };
}

module.exports = createTicket;
