const router = require("express").Router();
const multer = require("multer");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Invalid file type"), false);
    }
    cb(null, true);
  },
});

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
