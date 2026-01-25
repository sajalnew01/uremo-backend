const mongoose = require("mongoose");
const bcryptjs = require("bcryptjs");
const crypto = require("crypto");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },

    // PATCH_23: Affiliate / Referral fields
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    affiliateBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAffiliateEarned: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

// PATCH_23: Generate unique referral code before save
userSchema.pre("save", async function () {
  // Generate referral code if not set
  if (!this.referralCode) {
    // Generate a short unique code: first 3 chars of name + random 5 chars
    const namePart = (this.name || "user")
      .replace(/[^a-zA-Z]/g, "")
      .substring(0, 3)
      .toUpperCase();
    const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
    this.referralCode = `${namePart}${randomPart}`;
  }

  if (!this.isModified("password")) return;
  this.password = await bcryptjs.hash(this.password, 10);
});

module.exports = mongoose.model("User", userSchema);
