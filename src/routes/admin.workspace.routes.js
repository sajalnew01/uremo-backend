/**
 * PATCH_38: Admin Workspace Routes
 * Admin management of workers, screenings, projects, and earnings
 */
const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");

const {
  adminGetWorkers,
  adminGetWorkerById, // PATCH_61
  adminUpdateWorkerStatus,
  adminCreateScreening,
  adminGetScreenings,
  adminGetScreeningById,
  adminUpdateScreening,
  adminCloneScreening,
  adminDeleteScreening,
  adminCreateProject,
  adminGetProjects,
  adminGetProjectById, // PATCH_65.1
  adminUpdateProject, // PATCH_65.1
  adminDeleteProject, // PATCH_65.1
  adminAssignProject,
  adminGetEligibleWorkers, // PATCH_86
  adminCreditEarnings,
  adminAssignTask, // PATCH_61B: Assign tasks to workers
  adminGetQualifiedWorkerCounts, // PATCH_62: Get qualified workers per category
} = require("../controllers/workspace.controller");

// All routes require auth + admin
router.use(auth);
router.use(admin);

// Workers management
router.get("/workers", adminGetWorkers);
router.get("/workers/qualified-count", adminGetQualifiedWorkerCounts); // PATCH_62: Qualified workers per category
router.get("/worker/:id", adminGetWorkerById); // PATCH_61: Single worker for Worker 360 page
router.put("/worker/:id/status", adminUpdateWorkerStatus);
router.post("/workers/:id/assign-task", adminAssignTask); // PATCH_61B: Assign specialized task

// Screenings management
router.get("/screenings", adminGetScreenings);
router.post("/screenings", adminCreateScreening);
router.get("/screenings/:id", adminGetScreeningById);
router.put("/screenings/:id", adminUpdateScreening);
router.post("/screenings/:id/clone", adminCloneScreening);
router.delete("/screenings/:id", adminDeleteScreening);

// Projects management
router.get("/projects", adminGetProjects);
router.post("/projects", adminCreateProject);
router.get("/project/:id", adminGetProjectById); // PATCH_65.1: View single project
router.get("/project/:id/eligible-workers", adminGetEligibleWorkers); // PATCH_86: Get eligible workers
router.put("/project/:id", adminUpdateProject); // PATCH_65.1: Update project
router.delete("/project/:id", adminDeleteProject); // PATCH_65.1: Delete project
router.put("/project/:id/assign", adminAssignProject);
router.put("/project/:id/credit", adminCreditEarnings);

module.exports = router;
