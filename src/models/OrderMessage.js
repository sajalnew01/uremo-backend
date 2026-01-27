const mongoose = require("mongoose");

// Attachment sub-schema for order chat messages
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

const orderMessageSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    // Canonical sender id.
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    senderRole: {
      type: String,
      enum: ["user", "admin"],
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    // Attachments array for files
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    // Message delivery status
    status: {
      type: String,
      enum: ["sending", "sent", "delivered", "seen", "failed"],
      default: "sent",
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    seenAt: {
      type: Date,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false },
);

orderMessageSchema.index({ orderId: 1, createdAt: 1 });

orderMessageSchema.pre("validate", function () {
  if (!this.senderId && this.userId) this.senderId = this.userId;
  if (!this.userId && this.senderId) this.userId = this.senderId;
});

module.exports = mongoose.model("OrderMessage", orderMessageSchema);
