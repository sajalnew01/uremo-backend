const mongoose = require("mongoose");

const WorkerApplicationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: String,
    email: String,
    country: String,
    skills: String,
    resumeUrl: String,
    status: {
      type: String,
      enum: ["submitted", "approved", "rejected"],
      default: "submitted",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WorkerApplication", WorkerApplicationSchema);
