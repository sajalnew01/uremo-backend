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
        "payment_submitted",
        "approved",
        "rejected",
        "paid",
        "review",
        "completed",
      ],
      default: "pending",
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
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
