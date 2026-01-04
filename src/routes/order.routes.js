const express = require("express");
const auth = require("../middlewares/auth.middleware");
const { createOrder, myOrders } = require("../controllers/order.controller");

const router = express.Router();

router.post("/", auth, createOrder);
router.get("/my", auth, myOrders);

module.exports = router;
