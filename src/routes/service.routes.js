const express = require("express");
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");
const {
  getActiveServices,
  getServiceById,
  getServiceActions,
  getWorkspaceServices,
  getDealPortalServices,
  createService,
  getAllServices,
  updateService,
  deleteService,
} = require("../controllers/service.controller");

const router = express.Router();

// Public routes
router.get("/", getActiveServices);

// PATCH_38: Guarded list endpoints
router.get("/workspace", getWorkspaceServices);
router.get("/deals", getDealPortalServices);

// Admin routes
// IMPORTANT: keep static admin paths above '/:id' to avoid being captured as an id.
router.get("/admin/all", auth, admin, getAllServices);

// PATCH_38: Actions endpoint (must be above '/:id')
router.get("/:id/actions", getServiceActions);

router.get("/:id", getServiceById);

router.post("/", auth, admin, createService);
router.put("/:id", auth, admin, updateService);
router.delete("/:id", auth, admin, deleteService);

module.exports = router;
