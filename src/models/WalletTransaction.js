/**
 * PATCH_23: Wallet Transaction Model
 * Tracks all wallet balance changes (credits and debits)
 */
const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    source: {
      type: String,
      enum: [
        "topup",
        "service_purchase",
        "rental_purchase",
        "admin_adjustment",
        "refund",
      ],
      required: true,
    },
    // Reference to related document (order ID, etc.)
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    // Additional description for admin adjustments or notes
    description: {
      type: String,
      default: "",
    },
    // Balance after this transaction
    balanceAfter: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true },
);

// Index for fetching user transactions in order
walletTransactionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
