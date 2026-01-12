const mongoose = require("mongoose");

const emailCampaignSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true },
    htmlContent: { type: String, required: true },
    audience: {
      type: String,
      enum: ["all", "buyers", "workers", "custom"],
      required: true,
    },
    customEmails: {
      type: [String],
      default: [],
    },
    sentAt: {
      type: Date,
      default: null,
    },
    stats: {
      totalTargeted: { type: Number, default: 0 },
      totalSent: { type: Number, default: 0 },
      totalFailed: { type: Number, default: 0 },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EmailCampaign", emailCampaignSchema);
