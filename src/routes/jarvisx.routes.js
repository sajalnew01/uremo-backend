const express = require("express");
const rateLimit = require("express-rate-limit");
const auth = require("../middlewares/auth.middleware");
const authOptional = require("../middlewares/authOptional.middleware");
const admin = require("../middlewares/admin.middleware");
const JarvisX = require("../controllers/jarvisx.lockdown.controller");
const JarvisWrite = require("../controllers/jarvisxWrite.controller");

const router = express.Router();

// 20 req/min per IP
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again shortly." },
});

const chatLimiterMaybeAdmin = (req, res, next) => {
  if (req.user?.role === "admin") return next();
  return chatLimiter(req, res, next);
};

const authByMode = (req, res, next) => {
  const mode = String(req.body?.mode || "")
    .trim()
    .toLowerCase();
  if (mode === "admin") {
    return auth(req, res, (err) => {
      if (err) return next(err);
      return admin(req, res, next);
    });
  }
  return authOptional(req, res, next);
};

router.get("/context/public", JarvisX.getPublicContext);
router.get("/context/admin", auth, admin, JarvisX.getAdminContext);
// PATCH_08: Monitoring endpoint (must never crash)
router.get("/health", JarvisX.health);
router.get("/ping", JarvisX.ping);
// Public-safe: lets admin UI load even if auth headers are stripped by proxies.
// Does NOT return sensitive user data.
router.get("/health-report", authOptional, JarvisX.healthReport);

// Public-safe: checks if Groq is configured and reachable.
router.get("/llm-status", JarvisX.llmStatus);

// Agent-OS compatibility endpoint
router.post("/execute", auth, admin, JarvisWrite.execute);

// Auth optional; admin-mode enforcement happens inside controller.
router.post("/chat", authByMode, chatLimiterMaybeAdmin, JarvisX.chat);

// Public: create a service request (auth optional)
router.post(
  "/request-service",
  authOptional,
  chatLimiterMaybeAdmin,
  JarvisX.requestService
);

// Public: create a custom request (auth optional)
router.post(
  "/custom-request",
  authOptional,
  chatLimiterMaybeAdmin,
  JarvisX.customRequest
);

module.exports = router;
