/**
 * PATCH_38: Workspace Routes
 * Worker flow endpoints: profile, screenings, projects, earnings
 */
const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");

const {
  getWorkspaceProfile,
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

// Worker profile & status
router.get("/profile", getWorkspaceProfile);

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
