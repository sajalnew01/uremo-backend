const mongoose = require("mongoose");

const jarvisMessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true,
    },
    content: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const jarvisSessionSchema = new mongoose.Schema(
  {
    // userId or ip hash
    key: { type: String, required: true, unique: true, index: true },

    lastIntent: { type: String, default: "" },
    lastQuestionKey: { type: String, default: "" },

    collected: {
      platform: { type: String, default: "" },
      urgency: { type: String, default: "" },
      category: { type: String, default: "" },
      details: { type: String, default: "" },
    },

    lastMessages: { type: [jarvisMessageSchema], default: [] },
  },
  { timestamps: true }
);

jarvisSessionSchema.index({ updatedAt: -1 });

module.exports = mongoose.model("JarvisSession", jarvisSessionSchema);
