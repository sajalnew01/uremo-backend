const express = require("express");
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");

const {
  createPaymentMethod,
  getPaymentMethodsAdmin,
  updatePaymentMethod,
  deletePaymentMethod,
} = require("../controllers/admin.payment.controller");

const router = express.Router();
router.use(auth, admin);

router.post("/", createPaymentMethod);
router.get("/", getPaymentMethodsAdmin);
router.put("/:id", updatePaymentMethod);
router.delete("/:id", deletePaymentMethod);

module.exports = router;
