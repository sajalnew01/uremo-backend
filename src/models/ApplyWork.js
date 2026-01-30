const mongoose = require("mongoose");

/**
 * PATCH_38/43: Enhanced ApplyWork schema with worker status flow
 * PATCH_43: Full worker journey states
 * Applied → Screening Unlocked → Test Submitted → Ready To Work → Assigned → Working
 */
const applyWorkSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    position: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkPosition",
    },
    positionTitle: {
      type: String,
      default: "",
      trim: true,
    },
    category: {
      type: String,
      default: "",
    },
    resumeUrl: {
      type: String,
      required: true,
    },
    resumePublicId: {
      type: String,
    },
    resumeResourceType: {
      type: String,
      enum: ["image", "raw"],
    },
    resumeFormat: {
      type: String,
    },
    resumeOriginalName: {
      type: String,
    },
    resumeMimeType: {
      type: String,
    },
    message: {
      type: String,
    },
    // PATCH_43: Application status (admin review)
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    // PATCH_43: Worker journey states (authoritative)
    workerStatus: {
      type: String,
      enum: [
        "applied", // Just applied, waiting for admin approval
        "screening_unlocked", // Admin approved + unlocked screening
        "training_viewed", // PATCH_49: Viewed training materials, ready for test
        "test_submitted", // Submitted test, awaiting grading
        "failed", // Failed test (used all attempts)
        "ready_to_work", // Passed screening, available for projects
        "assigned", // Has active project assignment
        "working", // Currently working on project
        "suspended", // Admin suspended worker
        // Legacy states for backwards compat
        "fresh",
        "screening_available",
        "inactive",
      ],
      default: "applied",
    },
    // PATCH_49: Timestamp when training was viewed
    trainingViewedAt: {
      type: Date,
    },
    // PATCH_43: Attempt tracking for retries
    attemptCount: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 2,
    },
    // Screening/Test tracking
    screeningsCompleted: [
      {
        screeningId: { type: mongoose.Schema.Types.ObjectId, ref: "Screening" },
        completedAt: Date,
        score: Number,
      },
    ],
    testsCompleted: [
      {
        testId: { type: mongoose.Schema.Types.ObjectId, ref: "Test" },
        completedAt: Date,
        score: Number,
        passed: Boolean,
      },
    ],
    // Active project assignment
    currentProject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
    },
    projectsCompleted: [
      {
        projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
        completedAt: Date,
        rating: Number,
        earnings: Number,
      },
    ],
    // Earnings tracking
    totalEarnings: {
      type: Number,
      default: 0,
    },
    pendingEarnings: {
      type: Number,
      default: 0,
    },
    payRate: {
      type: Number,
      default: 0,
    },
    // Admin notes
    adminNotes: {
      type: String,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedAt: Date,
  },
  { timestamps: true },
);

module.exports = mongoose.model("ApplyWork", applyWorkSchema);
