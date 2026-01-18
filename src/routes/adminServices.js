const express = require("express");

// Keep existing admin services endpoints AND add PATCH_12 endpoints.
const existing = require("./admin.services.routes");

const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");

const {
  createService,
  activateServiceByBody,
  updateService,
} = require("../controllers/adminServices.controller");

const router = express.Router();

// Mount the existing routes (backwards compatible)
router.use(existing);

// PATCH_12: Explicit endpoints used by JarvisX admin tools (non-breaking additions)
router.post("/services/create", auth, admin, createService);
router.post("/services/activate", auth, admin, activateServiceByBody);
router.post("/services/update", auth, admin, updateService);

module.exports = router;
