const router = require("express").Router();

const { listPublic } = require("../controllers/workPosition.controller");

router.get("/", listPublic);

module.exports = router;
