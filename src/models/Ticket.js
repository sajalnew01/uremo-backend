const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

    subject: {
      type: String,
      required: true,
    },

    category: {
      type: String,
      enum: [
        "general",
        "payment",
        "order",
        "kyc",
        "rental",
        "technical",
        "affiliate",
        "other",
      ],
      default: "other",
    },

    status: {
      type: String,
      enum: ["open", "in_progress", "waiting_user", "closed"],
      default: "open",
    },

    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },

    // Track last message time for sorting
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },

    // Track if admin has unread messages
    hasUnreadAdmin: {
      type: Boolean,
      default: true,
    },

    // Track if user has unread messages
    hasUnreadUser: {
      type: Boolean,
      default: false,
    },

    // Admin assignment for ticket routing
    assignedAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // SLA tracking - first admin response
    firstResponseAt: {
      type: Date,
      default: null,
    },

    // SLA tracking - when ticket was resolved/closed
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Index for efficient querying
ticketSchema.index({ user: 1, status: 1 });
ticketSchema.index({ status: 1, priority: 1 });
ticketSchema.index({ lastMessageAt: -1 });
ticketSchema.index({ assignedAdmin: 1, status: 1 });

module.exports = mongoose.model("Ticket", ticketSchema);
