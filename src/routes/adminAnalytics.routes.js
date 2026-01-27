/**
 * PATCH_30: Admin Analytics Routes
 * Dashboard statistics, charts, and system health
 */

const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");
const {
  getAdminAnalytics,
  getCharts,
  getSystemHealth,
} = require("../controllers/adminAnalytics.controller");

// All routes require admin authentication
router.use(auth);
router.use(admin);

// GET /api/admin/analytics/dashboard - Main dashboard stats
router.get("/dashboard", getAdminAnalytics);

// GET /api/admin/analytics/charts - Chart data (orders, revenue, users over time)
router.get("/charts", getCharts);

// GET /api/admin/analytics/health - System health status
router.get("/health", getSystemHealth);

module.exports = router;
