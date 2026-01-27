const mongoose = require("mongoose");

// Attachment sub-schema for ticket messages
const attachmentSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },
    filename: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      enum: ["image", "pdf", "archive", "text", "unknown"],
      required: true,
    },
    publicId: {
      type: String,
      default: null,
    },
    size: {
      type: Number,
      default: null,
    },
  },
  { _id: false },
);

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

    // New: Multiple attachments array
    attachments: {
      type: [attachmentSchema],
      default: [],
    },

    // Legacy single attachment fields (kept for backward compatibility)
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
