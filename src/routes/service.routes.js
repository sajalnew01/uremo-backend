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

const { getServices } = require("../controllers/services.controller");

const router = express.Router();

// Public routes
router.get("/", getServices);

// Admin routes
// IMPORTANT: keep static admin paths above '/:id' to avoid being captured as an id.
router.get("/admin/all", auth, admin, getAllServices);

router.get("/:id", getServiceById);

router.post("/", auth, admin, createService);
router.put("/:id", auth, admin, updateService);
router.delete("/:id", auth, admin, deleteService);

module.exports = router;
