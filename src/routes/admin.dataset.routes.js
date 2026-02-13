/**
 * PATCH_95: Admin Dataset & RLHF Routes
 * Admin management of datasets, tasks, and RLHF submission review
 */
const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");

const {
  adminGetDatasets,
  adminCreateDataset,
  adminGetDataset,
  adminUpdateDataset,
  adminDeleteDataset,
  adminAddTask,
  adminBulkAddTasks,
  adminUpdateTask,
  adminDeleteTask,
  adminGetSubmissions,
  adminReviewSubmission,
} = require("../controllers/dataset.controller");

// All routes require auth + admin
router.use(auth);
router.use(admin);

// Dataset CRUD
router.get("/", adminGetDatasets);
router.post("/", adminCreateDataset);
router.get("/:id", adminGetDataset);
router.put("/:id", adminUpdateDataset);
router.delete("/:id", adminDeleteDataset);

// Dataset Tasks
router.post("/:id/tasks", adminAddTask);
router.post("/:id/tasks/bulk", adminBulkAddTasks);
router.put("/:id/tasks/:taskId", adminUpdateTask);
router.delete("/:id/tasks/:taskId", adminDeleteTask);

// RLHF Submissions Review
router.get("/rlhf/submissions", adminGetSubmissions);
router.post("/rlhf/submissions/:submissionId/review", adminReviewSubmission);

module.exports = router;
