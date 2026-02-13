const mongoose = require("mongoose");

/**
 * PATCH_95: RlhfSubmission Model — Worker submissions for RLHF dataset tasks
 */
const rlhfSubmissionSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    datasetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dataset",
      required: true,
      index: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DatasetTask",
      required: true,
      index: true,
    },
    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    answerPayload: { type: mongoose.Schema.Types.Mixed, default: {} },
    autoScore: { type: Number, default: 0 },
    finalScore: { type: Number, default: null },
    reviewStatus: {
      type: String,
      enum: ["pending_review", "approved", "rejected"],
      default: "pending_review",
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    rewardCredited: { type: Boolean, default: false },
    rewardAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Prevent duplicate submissions for same task by same worker
rlhfSubmissionSchema.index({ taskId: 1, workerId: 1 }, { unique: true });

module.exports = mongoose.model("RlhfSubmission", rlhfSubmissionSchema);
