const router = require("express").Router();

const {
  listPublic,
  getByServiceId,
} = require("../controllers/workPosition.controller");

// Public: list all active work positions
router.get("/", listPublic);

// PATCH_47: Get job role linked to a service
router.get("/by-service/:serviceId", getByServiceId);

module.exports = router;
