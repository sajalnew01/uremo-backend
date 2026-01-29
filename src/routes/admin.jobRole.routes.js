/**
 * PATCH_43: Admin Job Role Routes
 * Full control over job roles, applicants, screenings, and assignments
 */
const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");

const {
  getJobRole,
  getApplicants,
  approveApplicant,
  rejectApplicant,
  unlockScreening,
  setTraining,
  setScreening,
  assignProject,
  setWorkerStatus,
  getAllJobRoles,
} = require("../controllers/adminJobRole.controller");

// All routes require auth + admin
router.use(auth);
router.use(admin);

// List all job roles
router.get("/jobs", getAllJobRoles);

// Single job role details
router.get("/job/:id", getJobRole);

// Applicants for a job role
router.get("/job/:id/applicants", getApplicants);

// Applicant management
router.put("/job/:id/approve", approveApplicant);
router.put("/job/:id/reject", rejectApplicant);
router.put("/job/:id/unlock-screening", unlockScreening);

// Job role configuration
router.put("/job/:id/set-training", setTraining);
router.put("/job/:id/set-screening", setScreening);

// Worker assignment
router.put("/job/:id/assign-project", assignProject);
router.put("/job/:id/set-status", setWorkerStatus);

module.exports = router;
