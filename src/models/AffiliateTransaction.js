/**
 * PATCH_23: Affiliate Transaction Model
 * Tracks commission earned when referred users make purchases
 */

const mongoose = require("mongoose");

const affiliateTransactionSchema = new mongoose.Schema(
  {
    // The referrer who earns the commission
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // The referred user who made the purchase
    referredUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // The order that generated this commission
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },

    // Original order amount
    orderAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Commission percentage applied (stored for historical accuracy)
    commissionRate: {
      type: Number,
      required: true,
      default: 0.1, // 10%
    },

    // Commission amount earned
    commission: {
      type: Number,
      required: true,
      min: 0,
    },

    // Transaction status
    status: {
      type: String,
      enum: ["pending", "approved", "cancelled"],
      default: "approved", // Auto-approve on payment
      index: true,
    },

    // Optional notes
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for efficient queries
affiliateTransactionSchema.index({ user: 1, createdAt: -1 });
affiliateTransactionSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model(
  "AffiliateTransaction",
  affiliateTransactionSchema,
);
