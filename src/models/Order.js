const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
    status: {
      type: String,
      enum: [
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
      ],
      default: "pending",
    },

    // Draft orders (payment_pending) can expire automatically (cleanup job can remove them later)
    expiresAt: {
      type: Date,
      default: null,
    },

    paidAt: {
      type: Date,
      default: null,
    },
    payment: {
      methodId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PaymentMethod",
      },
      reference: String,
      proofUrl: String,
      proofPublicId: String,
      proofResourceType: {
        type: String,
        enum: ["image", "raw"],
      },
      proofFormat: String,
      submittedAt: Date,
      verifiedAt: Date,
    },

    statusLog: [
      {
        text: { type: String, required: true },
        at: { type: Date, default: Date.now },
      },
    ],

    timeline: [
      {
        message: String,
        by: {
          type: String,
          enum: ["system", "admin"],
          default: "system",
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    assignedWorker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    notes: {
      type: String,
    },

    // FIX_PACK_02_REJECTED_CHAT_ORDERS_GREEN
    // When true, a rejected order is moved to the admin's "Rejected Orders" list.
    // This does not delete the order; it just hides it from the default admin list.
    isRejectedArchive: {
      type: Boolean,
      default: false,
      index: true,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },

    // EMAIL_AUTOMATION_PACK_01
    // Used by the cron reminder endpoint to avoid spamming users.
    reminderSent: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
