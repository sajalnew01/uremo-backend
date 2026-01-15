const mongoose = require("mongoose");

const jarvisMemorySchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ["admin_correction", "approval", "rejection", "system_outcome"],
      required: true,
      index: true,
    },

    triggerText: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
      index: true,
    },

    correctResponse: {
      type: String,
      default: "",
      trim: true,
      maxlength: 4000,
    },

    tags: {
      type: [String],
      default: [],
      index: true,
    },

    confidence: {
      type: Number,
      default: 0.5,
      min: 0,
      max: 1,
      index: true,
    },

    createdAt: { type: Date, default: Date.now, index: true },
  },
  { minimize: false }
);

jarvisMemorySchema.index({ source: 1, createdAt: -1 });

module.exports = mongoose.model("JarvisMemory", jarvisMemorySchema);
