const express = require("express");
const auth = require("../middlewares/auth.middleware");
const { checkout } = require("../controllers/payment.controller");

const router = express.Router();

router.post("/checkout", auth, checkout);

module.exports = router;
