const mongoose = require("mongoose");

const paymentMethodSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // PayPal, Binance, USDT
    type: {
      type: String,
      enum: ["paypal", "crypto", "binance", "bank"],
      required: true,
    },

    details: {
      type: String, // email / uid / address
      required: true,
    },

    instructions: String,

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PaymentMethod", paymentMethodSchema);
