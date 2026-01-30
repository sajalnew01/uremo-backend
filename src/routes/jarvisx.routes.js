/**
 * JarvisX Routes
 * Wires up all JarvisX API endpoints
 */
const express = require("express");
const router = express.Router();

const JarvisX = require("../controllers/jarvisx.controller");
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");

// ============================================================
// V1 Endpoints (Legacy - kept for backward compatibility)
// ============================================================
router.get("/public-context", JarvisX.getPublicContext);
router.post("/chat", JarvisX.chat);
router.post("/request-service", JarvisX.requestService);
router.get("/health", JarvisX.healthReport);

// Admin endpoints (auth + admin required)
router.get("/admin-context", auth, admin, JarvisX.getAdminContext);

// ============================================================
// V2 Endpoints (PATCH_51 - Brain-Powered Tool Architecture)
// ============================================================
// New brain-powered chat - Intent → Policy → Context → Blueprint → Polish
router.post("/v2/chat", JarvisX.chatV2);

// Execute button actions from chat responses
router.post("/v2/action", JarvisX.executeActionV2);

// Brain health check
router.get("/v2/health", JarvisX.healthV2);

module.exports = router;
