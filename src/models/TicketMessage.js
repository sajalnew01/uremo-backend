const mongoose = require("mongoose");

const ticketMessageSchema = new mongoose.Schema(
  {
    ticket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ticket",
      required: true,
    },

    senderType: {
      type: String,
      enum: ["user", "admin"],
      required: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    message: {
      type: String,
      required: true,
    },

    attachment: {
      type: String,
      default: null,
    },

    attachmentType: {
      type: String,
      enum: ["image", "document", null],
      default: null,
    },
  },
  { timestamps: true },
);

// Index for efficient message retrieval
ticketMessageSchema.index({ ticket: 1, createdAt: 1 });

module.exports = mongoose.model("TicketMessage", ticketMessageSchema);
