const User = require("../models/User");
const Service = require("../models/Service");
const jwt = require("jsonwebtoken");
const bcryptjs = require("bcryptjs");

const { sendEmail } = require("../services/email.service");
const { welcomeEmail } = require("../emails/templates");

const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findUserByEmailInsensitive = async (email) => {
  const normalized = String(email || "").trim();
  if (!normalized) return null;
  // Case-insensitive exact match (supports legacy mixed-case stored emails).
  const re = new RegExp(`^${escapeRegExp(normalized)}$`, "i");
  return User.findOne({ email: re });
};

exports.signup = async (req, res, next) => {
  try {
    const { name, email, password, referralCode } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    const emailNormalized = String(email).trim().toLowerCase();

    const existingUser = await findUserByEmailInsensitive(emailNormalized);
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // PATCH_23: Find referrer if referral code provided
    let referredBy = null;
    if (referralCode) {
      const referrer = await User.findOne({
        referralCode: String(referralCode).trim().toUpperCase(),
      });
      if (referrer) {
        referredBy = referrer._id;
      }
    }

    const user = await User.create({
      name,
      email: emailNormalized,
      password,
      referredBy,
    });

    if (!process.env.JWT_SECRET) {
      console.error("[AUTH] FATAL: JWT_SECRET environment variable is not set");
      return res.status(500).json({ message: "Server configuration error" });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    // Email is best-effort; never block signup on email failure.
    setImmediate(async () => {
      try {
        const topServices = await Service.find({ active: { $ne: false } })
          .select("title category price")
          .sort({ createdAt: -1 })
          .limit(3)
          .lean();

        await sendEmail({
          to: user.email,
          subject: "Welcome to UREMO",
          html: welcomeEmail(user.email, topServices),
        });
      } catch (err) {
        console.error("[email] welcome failed", {
          userEmail: user.email,
          message: err?.message || String(err),
        });
      }
    });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        referralCode: user.referralCode,
        referredBy: user.referredBy || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    console.log("[LOGIN]", {
      origin: req.headers.origin,
      referer: req.headers.referer,
      email: typeof email === "string" ? email.trim().toLowerCase() : undefined,
      hasPassword: Boolean(password),
    });

    if (!email || !password) {
      return res.status(400).json({
        code: "MISSING_FIELDS",
        message: "Email and password required",
        received: { hasEmail: Boolean(email), hasPassword: Boolean(password) },
      });
    }

    const emailNormalized = String(email).trim().toLowerCase();
    const user = await findUserByEmailInsensitive(emailNormalized);
    if (!user) {
      return res.status(401).json({
        code: "USER_NOT_FOUND",
        message: "Invalid email or password",
      });
    }

    const isMatch = await bcryptjs.compare(String(password), user.password);
    if (!isMatch) {
      console.warn("[LOGIN_BAD_PASSWORD]", {
        userId: String(user._id),
        email: user.email,
        passwordHashPrefix:
          typeof user.password === "string" ? user.password.slice(0, 4) : null,
      });
      // Legacy compatibility: if a user was seeded with plaintext password,
      // allow one successful login and upgrade to bcrypt.
      if (
        typeof user.password === "string" &&
        user.password === String(password)
      ) {
        user.password = String(password);
        await user.save();
        console.warn("[auth] upgraded legacy plaintext password", {
          userId: String(user._id),
          email: user.email,
        });
      } else {
        return res.status(401).json({
          code: "BAD_PASSWORD",
          message: "Invalid email or password",
        });
      }
    }

    if (!process.env.JWT_SECRET) {
      console.error("[AUTH] FATAL: JWT_SECRET environment variable is not set");
      return res.status(500).json({ message: "Server configuration error" });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      token,
      user: { id: user._id, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error" });
  }
};

// Secret-protected admin promotion endpoint.
// Enable by setting ADMIN_SETUP_SECRET in the environment.
// Call with header: x-admin-setup-secret: <secret>
// Body: { "email": "user@example.com" }
exports.makeAdmin = async (req, res) => {
  try {
    const secret = process.env.ADMIN_SETUP_SECRET;
    if (!secret) {
      return res.status(404).json({ message: "Route not found" });
    }

    const provided = req.headers["x-admin-setup-secret"];
    if (!provided || provided !== secret) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await findUserByEmailInsensitive(String(email).trim());
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.role = "admin";
    await user.save();

    return res.json({
      message: "User promoted to admin",
      user: { id: user._id, email: user.email, role: user.role },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
};

// Secret-protected password reset endpoint.
// Enable by setting ADMIN_SETUP_SECRET in the environment.
// Call with header: x-admin-setup-secret: <secret>
// Body: { "email": "user@example.com", "newPassword": "..." }
exports.resetPasswordWithSecret = async (req, res) => {
  try {
    const secret = process.env.ADMIN_SETUP_SECRET;
    if (!secret) {
      return res.status(404).json({ message: "Route not found" });
    }

    const provided = req.headers["x-admin-setup-secret"];
    if (!provided || provided !== secret) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { email, password, newPassword } = req.body || {};
    const nextPassword =
      typeof newPassword === "string" && newPassword.length
        ? newPassword
        : password;

    if (!email || !nextPassword) {
      return res
        .status(400)
        .json({ message: "Email and newPassword are required" });
    }

    const user = await findUserByEmailInsensitive(String(email).trim());
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.password = String(nextPassword);
    await user.save();

    return res.json({
      message: "Password updated",
      user: { id: user._id, email: user.email, role: user.role },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
};

/**
 * Get current user profile
 * GET /api/auth/me
 */
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await User.findById(userId).select("-password -__v");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        referralCode: user.referralCode,
        affiliateBalance: user.affiliateBalance || 0,
        totalAffiliateEarned: user.totalAffiliateEarned || 0,
        walletBalance: user.walletBalance || 0,
        // PATCH_34: Onboarding fields
        onboardingCompleted: user.onboardingCompleted || false,
        interestCategory: user.interestCategory || "general",
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Server error" });
  }
};

/**
 * PATCH_34: Update user onboarding status
 * PUT /api/auth/onboarding
 */
exports.updateOnboarding = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res
        .status(401)
        .json({ ok: false, message: "Authentication required" });
    }

    const { interestCategory } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    // Validate category
    const validCategories = [
      "microjobs",
      "forex_crypto",
      "banks_wallets",
      "general",
    ];
    user.interestCategory = validCategories.includes(interestCategory)
      ? interestCategory
      : "general";
    user.onboardingCompleted = true;

    await user.save();

    res.json({
      ok: true,
      message: "Onboarding completed",
      user: {
        onboardingCompleted: user.onboardingCompleted,
        interestCategory: user.interestCategory,
      },
    });
  } catch (error) {
    console.error("[Auth] updateOnboarding error:", error);
    res
      .status(500)
      .json({ ok: false, message: error.message || "Server error" });
  }
};
