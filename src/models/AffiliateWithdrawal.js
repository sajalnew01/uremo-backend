/**
 * PATCH_23: Affiliate Withdrawal Model
 * Tracks withdrawal requests from users
 */

const mongoose = require("mongoose");

const affiliateWithdrawalSchema = new mongoose.Schema(
  {
    // User requesting withdrawal
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Withdrawal amount
    amount: {
      type: Number,
      required: true,
      min: 10, // Minimum $10
    },

    // Payment method details
    paymentMethod: {
      type: String,
      enum: ["paypal", "crypto", "bank"],
      required: true,
    },

    // Payment details (email, wallet address, etc.)
    paymentDetails: {
      type: String,
      required: true,
    },

    // Withdrawal status
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "paid"],
      default: "pending",
      index: true,
    },

    // Admin notes (for rejection reason, etc.)
    adminNotes: {
      type: String,
      default: "",
    },

    // Transaction ID after payment
    transactionId: {
      type: String,
      default: "",
    },

    // Processed by admin
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Processed timestamp
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for efficient queries
affiliateWithdrawalSchema.index({ status: 1, createdAt: -1 });
affiliateWithdrawalSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model(
  "AffiliateWithdrawal",
  affiliateWithdrawalSchema,
);
