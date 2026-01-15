const express = require("express");
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");
const { getSocketHealth } = require("../controllers/debug.controller");

const router = express.Router();

// Admin-only socket health report
router.get("/socket-health", auth, admin, getSocketHealth);

module.exports = router;
