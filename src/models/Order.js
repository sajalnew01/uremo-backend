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
        "approved",
        "rejected",
      ],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["paypal", "binance", "usdt"],
    },
    transactionRef: {
      type: String,
    },
    paymentProof: {
      type: String,
    },
    paymentRef: {
      type: String,
    },
    documents: {
      paymentProof: { type: String },
      senderKyc: { type: String },
    },
    contact: {
      email: { type: String },
      phone: { type: String },
    },

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
