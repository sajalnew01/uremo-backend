const express = require("express");
const multer = require("multer");
const auth = require("../middlewares/auth.middleware");
const {
  applyWork,
  listApplications,
  updateApplication,
} = require("../controllers/worker.controller");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/apply", auth, upload.single("resume"), applyWork);
router.get("/admin", auth, listApplications);
router.put("/admin/:id", auth, updateApplication);

module.exports = router;
