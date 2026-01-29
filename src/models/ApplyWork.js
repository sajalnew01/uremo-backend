const mongoose = require("mongoose");

/**
 * PATCH_38: Enhanced ApplyWork schema with worker status flow
 * Fresh → Screening Available → Ready To Work → Assigned → Earning
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
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    // PATCH_38: Worker status flow
    workerStatus: {
      type: String,
      enum: [
        "fresh",
        "screening_available",
        "ready_to_work",
        "assigned",
        "inactive",
      ],
      default: "fresh",
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
