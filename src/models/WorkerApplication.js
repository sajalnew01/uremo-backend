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
    resumePublicId: String,
    resumeResourceType: {
      type: String,
      enum: ["image", "raw"],
    },
    resumeFormat: String,
    resumeMimeType: String,
    status: {
      type: String,
      enum: ["submitted", "approved", "rejected"],
      default: "submitted",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WorkerApplication", WorkerApplicationSchema);
