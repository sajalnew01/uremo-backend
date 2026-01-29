/**
 * PATCH_38: Admin Workspace Routes
 * Admin management of workers, screenings, projects, and earnings
 */
const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");

const {
  adminGetWorkers,
  adminUpdateWorkerStatus,
  adminCreateScreening,
  adminGetScreenings,
  adminCreateProject,
  adminGetProjects,
  adminAssignProject,
  adminCreditEarnings,
} = require("../controllers/workspace.controller");

// All routes require auth + admin
router.use(auth);
router.use(admin);

// Workers management
router.get("/workers", adminGetWorkers);
router.put("/worker/:id/status", adminUpdateWorkerStatus);

// Screenings management
router.get("/screenings", adminGetScreenings);
router.post("/screenings", adminCreateScreening);

// Projects management
router.get("/projects", adminGetProjects);
router.post("/projects", adminCreateProject);
router.put("/project/:id/assign", adminAssignProject);
router.put("/project/:id/credit", adminCreditEarnings);

module.exports = router;
