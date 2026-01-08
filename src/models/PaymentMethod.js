const mongoose = require("mongoose");

const paymentMethodSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["paypal", "binance", "usdt"],
      required: true,
    },
    label: {
      type: String,
      required: true,
    },
    value: {
      type: String,
      required: true,
    },
    instructions: {
      type: String,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PaymentMethod", paymentMethodSchema);
