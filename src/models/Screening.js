const mongoose = require("mongoose");

/**
 * PATCH_38: Screening model for worker qualification
 * Admin creates screenings, workers complete them to advance from Fresh → Screening Available → Ready To Work
 */
const screeningSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    category: {
      type: String,
      required: true,
      enum: [
        "microjobs",
        "writing",
        "teaching",
        "coding_math",
        "outlier",
        "other",
      ],
    },
    // Training materials (links, PDFs, videos)
    trainingMaterials: [
      {
        title: String,
        type: { type: String, enum: ["link", "pdf", "video"] },
        url: String,
        description: String,
      },
    ],
    // Questions for the screening
    questions: [
      {
        question: String,
        // PATCH_52A: single/multi choice support (keep legacy enums for compatibility)
        type: {
          type: String,
          enum: ["single", "multi", "multiple_choice", "text", "file_upload"],
          default: "single",
        },
        options: [String], // For multiple choice
        // Legacy single-answer field (kept for backward compatibility)
        correctAnswer: String,
        // PATCH_52A: multi-answer support
        correctAnswers: { type: [String], default: [] },
        points: { type: Number, default: 1 },
      },
    ],
    passingScore: {
      type: Number,
      default: 70, // Percentage
    },
    timeLimit: {
      type: Number,
      default: 60, // Minutes
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
  { timestamps: true },
);

module.exports = mongoose.model("Screening", screeningSchema);
