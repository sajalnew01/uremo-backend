const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");

const {
  createDraftService,
  createService,
  activateService,
  activateServiceByBody,
  updateService,
  deleteService,
} = require("../controllers/adminServices.controller");

// PATCH_13: Complete CRUD for admin services
router.post("/services", auth, admin, createDraftService);
router.post("/services/create", auth, admin, createService);
router.post("/services/update", auth, admin, updateService);
router.post("/services/delete", auth, admin, deleteService);
router.post("/services/activate", auth, admin, activateServiceByBody);
router.patch("/services/:id/activate", auth, admin, activateService);
router.delete("/services/:id", auth, admin, deleteService);

module.exports = router;
