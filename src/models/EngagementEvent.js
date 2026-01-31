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
      maxlength: 500,
    },

    message: {
      type: String,
      required: true,
      maxlength: 5000,
    },

    targetTags: [String],

    processed: {
      type: Boolean,
      default: false,
    },

    processingStarted: {
      type: Date,
      default: null,
    },

    failureCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastError: String,

    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
    },

    processedAt: Date,

    sentCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

engagementEventSchema.index({ type: 1, processed: 1, createdAt: -1 });
engagementEventSchema.index({ processed: 1, createdAt: -1 });
engagementEventSchema.index({ processingStarted: 1 }, { sparse: true });
engagementEventSchema.index({ idempotencyKey: 1 }, { sparse: true });
engagementEventSchema.index({ failureCount: 1, processed: 1 });

module.exports = mongoose.model("EngagementEvent", engagementEventSchema);
