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

    // Track asked questions to prevent loops
    askedQuestions: { type: [String], default: [] },

    collected: {
      platform: { type: String, default: "" },
      urgency: { type: String, default: "" },
      category: { type: String, default: "" },
      details: { type: String, default: "" },
    },

    lastMessages: { type: [jarvisMessageSchema], default: [] },

    // TTL: Auto-expire after 30 minutes of inactivity
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 60 * 1000),
      index: { expires: 0 }, // MongoDB TTL index
    },
  },
  { timestamps: true }
);

jarvisSessionSchema.index({ updatedAt: -1 });

// Update expiresAt on every save to extend session
jarvisSessionSchema.pre("save", function (next) {
  this.expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  next();
});

module.exports = mongoose.model("JarvisSession", jarvisSessionSchema);
