const mongoose = require("mongoose");

const CustomRequestSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    platform: { type: String, required: true, trim: true, lowercase: true },

    requestType: {
      type: String,
      enum: ["KYC", "ACCOUNT", "OTHER"],
      default: "OTHER",
    },

    quantity: { type: Number, default: 1, min: 1 },

    unitPrice: { type: Number, default: null, min: 0 },

    notes: { type: String, default: "", trim: true },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "fulfilled"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CustomRequest", CustomRequestSchema);
