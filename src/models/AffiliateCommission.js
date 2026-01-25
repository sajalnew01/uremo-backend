const mongoose = require("mongoose");

/**
 * AffiliateCommission Model
 * Tracks commission earned by referrers when their referred users make purchases
 */
const affiliateCommissionSchema = new mongoose.Schema(
  {
    referrer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    referredUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true, // Prevent duplicate commissions for same order
    },

    orderAmount: {
      type: Number,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    commissionRate: {
      type: Number,
      default: 10, // 10%
    },

    status: {
      type: String,
      enum: ["pending", "approved", "paid", "cancelled"],
      default: "pending",
    },

    paymentMethod: {
      type: String,
      enum: ["wallet", "stripe", "manual", "other"],
      default: "other",
    },

    paidAt: {
      type: Date,
      default: null,
    },

    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

// Index for efficient queries
affiliateCommissionSchema.index({ referrer: 1, status: 1 });
affiliateCommissionSchema.index({ createdAt: -1 });

module.exports = mongoose.model(
  "AffiliateCommission",
  affiliateCommissionSchema,
);
