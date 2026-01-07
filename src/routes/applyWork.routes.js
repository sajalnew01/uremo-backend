const router = require("express").Router();
const multer = require("multer");
const upload = multer({ dest: "uploads/" });

const {
  apply,
  getAll,
  updateStatus,
  getMyApplication,
} = require("../controllers/applyWork.controller");

const protect = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");

router.post("/", protect, upload.single("resume"), apply);
router.get("/me", protect, getMyApplication);
router.get("/admin", protect, admin, getAll);
router.put("/admin/:id", protect, admin, updateStatus);

module.exports = router;
