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
    },

    description: {
      type: String,
      required: true,
    },

    price: {
      type: Number,
      required: true,
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

    active: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Service", serviceSchema);
