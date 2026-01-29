const mongoose = require("mongoose");

/**
 * PATCH_38: Project model for worker assignments
 * Admin creates projects, assigns to ready workers, tracks completion and earnings
 */
const projectSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    category: {
      type: String,
      required: true,
      enum: [
        "microjobs",
        "writing",
        "teaching",
        "coding_math",
        "outlier",
        "other",
      ],
    },
    // Project details
    instructions: {
      type: String,
      default: "",
    },
    deliverables: [
      {
        title: String,
        description: String,
        required: { type: Boolean, default: true },
      },
    ],
    // Payment
    payRate: {
      type: Number,
      required: true,
    },
    payType: {
      type: String,
      enum: ["per_task", "hourly", "fixed"],
      default: "per_task",
    },
    estimatedTasks: {
      type: Number,
      default: 1,
    },
    // Assignment
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    assignedAt: Date,
    // Status tracking
    status: {
      type: String,
      enum: [
        "draft",
        "open",
        "assigned",
        "in_progress",
        "completed",
        "cancelled",
      ],
      default: "draft",
    },
    // Completion
    completedAt: Date,
    completionNotes: String,
    adminRating: {
      type: Number,
      min: 1,
      max: 5,
    },
    // Earnings credited
    earningsCredited: {
      type: Number,
      default: 0,
    },
    creditedAt: Date,
    // Deadline
    deadline: Date,
    // Created by admin
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Project", projectSchema);
