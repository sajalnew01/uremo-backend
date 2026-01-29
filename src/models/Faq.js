/**
 * PATCH_41: FAQ Model for Frequently Asked Questions
 * Simple Q&A collection with ordering support
 */

const mongoose = require("mongoose");

const faqSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: [true, "Question is required"],
      trim: true,
      maxlength: [500, "Question cannot exceed 500 characters"],
    },
    answer: {
      type: String,
      required: [true, "Answer is required"],
      trim: true,
    },
    category: {
      type: String,
      enum: ["general", "verification", "payments", "work", "accounts"],
      default: "general",
    },
    order: {
      type: Number,
      default: 0,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Index for ordering
faqSchema.index({ order: 1, createdAt: 1 });

module.exports = mongoose.model("Faq", faqSchema);
