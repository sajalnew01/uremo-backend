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
      enum: ["open", "in_progress", "closed"],
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
  },
  { timestamps: true },
);

// Index for efficient querying
ticketSchema.index({ user: 1, status: 1 });
ticketSchema.index({ status: 1, priority: 1 });
ticketSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.model("Ticket", ticketSchema);
