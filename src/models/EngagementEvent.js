const mongoose = require("mongoose");

const engagementEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["service_new", "job_new", "deal_new", "rental_new", "campaign"],
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    targetTags: [String], // interests to target

    processed: {
      type: Boolean,
      default: false,
    },

    processedAt: Date,

    sentCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

// Index for efficient querying
engagementEventSchema.index({ processed: 1, createdAt: -1 });

module.exports = mongoose.model("EngagementEvent", engagementEventSchema);
