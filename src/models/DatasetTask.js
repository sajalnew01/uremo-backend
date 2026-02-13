const mongoose = require("mongoose");

/**
 * PATCH_95: DatasetTask Model — Individual RLHF tasks within a Dataset
 */
const datasetTaskSchema = new mongoose.Schema(
  {
    datasetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dataset",
      required: true,
      index: true,
    },
    prompt: { type: String, required: true },
    responseA: { type: String, default: "" },
    responseB: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    batchId: { type: String, default: "" },
    correctAnswer: { type: String, default: "" },
    referenceSources: [{ type: String }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("DatasetTask", datasetTaskSchema);
