const express = require("express");
const auth = require("../middlewares/auth.middleware");
const {
  checkout,
  getActivePaymentMethods,
} = require("../controllers/payment.controller");

const router = express.Router();

router.get("/", getActivePaymentMethods);
router.post("/checkout", auth, checkout);

module.exports = router;
