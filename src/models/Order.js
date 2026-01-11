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
      submittedAt: Date,
    },

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
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
