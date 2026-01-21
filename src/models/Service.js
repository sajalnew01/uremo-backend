const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    description: {
      type: String,
      required: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "USD",
    },

    deliveryType: {
      type: String,
      enum: ["instant", "manual", "assisted"],
      default: "manual",
    },

    images: [
      {
        type: String,
      },
    ],

    imageUrl: {
      type: String,
      default: "",
    },

    requirements: {
      type: String,
    },

    // PATCH_15: Product vision fields - safe strings with defaults
    // Expected category values: microjobs | forex_crypto | banks_gateways_wallets | general
    serviceType: {
      type: String,
      default: "general",
      index: true,
    },
    // Expected serviceType values: fresh_profile | already_onboarded | interview_process | interview_passed | general

    countries: {
      type: [String],
      default: ["Global"],
      index: true,
    },

    status: {
      type: String,
      enum: ["draft", "active", "archived"],
      default: "draft",
      index: true,
    },

    tags: {
      type: [String],
      default: [],
    },

    features: {
      type: [String],
      default: [],
    },

    // Legacy active field - kept for backward compatibility
    active: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    viewCount: {
      type: Number,
      default: 0,
    },

    purchaseCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

// PATCH_15: Compound indexes for efficient filtering
serviceSchema.index({ status: 1, category: 1, serviceType: 1 });
serviceSchema.index({ status: 1, countries: 1 });
serviceSchema.index({ status: 1, category: 1, countries: 1, serviceType: 1 });
serviceSchema.index({ active: 1, category: 1 });

module.exports = mongoose.model("Service", serviceSchema);
