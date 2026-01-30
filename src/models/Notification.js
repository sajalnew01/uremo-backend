const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      enum: [
        "order",
        "ticket",
        "wallet",
        "affiliate",
        "rental",
        "system",
        "workspace",
      ], // PATCH_49: Added workspace
      default: "system",
    },

    // Optional link to related resource
    resourceType: {
      type: String,
      enum: ["order", "ticket", "rental", "withdrawal", "application", null], // PATCH_49: Added application
      default: null,
    },

    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// Indexes for efficient querying
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
