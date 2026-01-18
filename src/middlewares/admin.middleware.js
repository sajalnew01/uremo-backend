const User = require("../models/User");

module.exports = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(403).json({ message: "Admin access required" });
    }

    // Do NOT trust the role claim blindly; it can be stale if the user was
    // promoted/demoted after the token was issued.
    const user = await User.findById(userId).select("role").lean();
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    // Normalize for downstream controllers.
    req.user.role = "admin";
    return next();
  } catch (err) {
    console.error("[ADMIN_MIDDLEWARE_FAIL]", err?.message);
    return res.status(500).json({ message: "Server error" });
  }
};
