const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    platform: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
    },

    shortDescription: {
      type: String,
      required: true,
      trim: true,
    },

    images: [
      {
        type: String,
      },
    ],

    serviceType: {
      type: String,
      enum: [
        "onboarding_assistance",
        "verification_support",
        "readiness_check",
        "custom_request",
      ],
      required: true,
    },

    price: {
      type: Number,
      required: true,
    },

    active: {
      type: Boolean,
      default: true,
    },

    requiresDocuments: {
      type: Boolean,
      default: true,
    },

    manualOnly: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Service", serviceSchema);
