const User = require("../models/User");

const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

exports.userExists = async (req, res) => {
  try {
    const rawEmail = String(req.query?.email || "");
    const emailNormalized = rawEmail.trim().toLowerCase();

    if (!emailNormalized) {
      return res.status(400).json({
        code: "MISSING_EMAIL",
        message: "email query param is required",
      });
    }

    // Case-insensitive exact match (supports legacy mixed-case stored emails).
    const re = new RegExp(`^${escapeRegExp(emailNormalized)}$`, "i");
    const user = await User.findOne({ email: re }).select("_id email").lean();

    const uri = process.env.MONGO_URI || "";

    return res.json({
      exists: Boolean(user),
      emailNormalized,
      db: uri ? uri.slice(0, 25) : "",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      code: "SERVER_ERROR",
      message: err?.message || "Server error",
    });
  }
};
