/**
 * JarvisX Routes
 * Wires up all JarvisX API endpoints
 */
const express = require("express");
const router = express.Router();

const JarvisX = require("../controllers/jarvisx.controller");
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");

// Public endpoints (no auth required)
router.get("/public-context", JarvisX.getPublicContext);
router.post("/chat", JarvisX.chat);
router.post("/request-service", JarvisX.requestService);
router.get("/health", JarvisX.healthReport);

// Admin endpoints (auth + admin required)
router.get("/admin-context", auth, admin, JarvisX.getAdminContext);

module.exports = router;
