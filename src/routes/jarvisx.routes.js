const express = require("express");
const rateLimit = require("express-rate-limit");
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");
const JarvisX = require("../controllers/jarvisx.controller");

const router = express.Router();

// 20 req/min per IP
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again shortly." },
});

router.get("/context/public", JarvisX.getPublicContext);
router.get("/context/admin", auth, admin, JarvisX.getAdminContext);

// Auth optional; admin-mode enforcement happens inside controller.
router.post("/chat", chatLimiter, JarvisX.chat);

module.exports = router;
