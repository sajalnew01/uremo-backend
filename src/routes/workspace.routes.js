/**
 * PATCH_38/43: Workspace Routes
 * Worker flow endpoints: profile, screenings, projects, earnings
 * PATCH_43: Multi-job support, apply to specific jobs
 */
const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");

const {
  getWorkspaceProfile,
  applyToJob,
  getAvailableScreenings,
  getScreening,
  submitScreening,
  getMyProjects,
  getProject,
  submitProject,
  getEarnings,
  requestWithdrawal,
} = require("../controllers/workspace.controller");

// All routes require authentication
router.use(auth);

// Worker profile & status (multi-job)
router.get("/profile", getWorkspaceProfile);

// PATCH_43: Apply to a specific job role
router.post("/apply/:jobId", applyToJob);

// Screenings
router.get("/screenings", getAvailableScreenings);
router.get("/screening/:id", getScreening);
router.post("/screening/:id/submit", submitScreening);

// Projects
router.get("/projects", getMyProjects);
router.get("/project/:id", getProject);
router.post("/project/:id/submit", submitProject);

// Earnings
router.get("/earnings", getEarnings);
router.post("/withdraw", requestWithdrawal);

module.exports = router;
