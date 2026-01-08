const express = require("express");
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");
const {
  getAllOrders,
  updateOrderStatus,
  addOrderNote,
} = require("../controllers/admin.controller");
const {
  getAllServices,
  createService,
  updateService,
} = require("../controllers/service.controller");
const upload = require("../middlewares/upload.middleware");
const { uploadImages } = require("../controllers/upload.controller");

const router = express.Router();

router.get("/orders", auth, admin, getAllOrders);
router.put("/orders/:id", auth, admin, updateOrderStatus);
router.post("/orders/:id/note", auth, admin, addOrderNote);

// Service management
router.get("/services", auth, admin, getAllServices);
router.post("/services", auth, admin, createService);
router.put("/services/:id", auth, admin, updateService);

router.post(
  "/upload-images",
  auth,
  admin,
  upload.array("images", 5),
  uploadImages
);

module.exports = router;
