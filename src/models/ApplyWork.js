const mongoose = require("mongoose");

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
  },
  { timestamps: true }
);

module.exports = mongoose.model("ApplyWork", applyWorkSchema);
