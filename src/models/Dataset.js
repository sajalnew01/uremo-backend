const mongoose = require("mongoose");

/**
 * PATCH_95: Dataset Model — Reusable RLHF Dataset containers
 * Datasets hold task configurations and are linked to Projects for execution.
 */
const datasetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    datasetType: {
      type: String,
      required: true,
      enum: [
        "ranking",
        "generation",
        "red_team",
        "fact_check",
        "coding",
        "multimodal",
      ],
      default: "ranking",
    },
    difficultyLevel: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "intermediate",
    },
    minJustificationWords: { type: Number, default: 30 },
    minWordCount: { type: Number, default: 0 },
    allowMultiResponseComparison: { type: Boolean, default: false },
    isActive: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Dataset", datasetSchema);
