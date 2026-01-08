const express = require("express");
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");
const {
  getActiveServices,
  getServiceById,
  createService,
  getAllServices,
  updateService,
  deleteService,
} = require("../controllers/service.controller");

const router = express.Router();

// Public routes
router.get("/", getActiveServices);
router.get("/:id", getServiceById);

// Admin routes
router.post("/", auth, admin, createService);
router.get("/admin/all", auth, admin, getAllServices);
router.put("/:id", auth, admin, updateService);
router.delete("/:id", auth, admin, deleteService);

module.exports = router;
