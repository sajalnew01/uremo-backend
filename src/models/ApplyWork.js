const mongoose = require("mongoose");

const applyWorkSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
      type: String,
      default: "",
    },
    resumeUrl: {
      type: String,
      required: true,
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
