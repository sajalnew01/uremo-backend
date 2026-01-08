const express = require("express");
const multer = require("multer");
const auth = require("../middlewares/auth.middleware");
const upload = require("../utils/upload");
const {
  uploadPaymentProof,
  uploadProofs,
  uploadPayment,
} = require("../controllers/upload.controller");

const router = express.Router();

const memoryUpload = multer({ storage: multer.memoryStorage() });

router.post(
  "/payment-proof",
  auth,
  memoryUpload.single("file"),
  uploadPaymentProof
);

router.post(
  "/payment-proof/:orderId",
  auth,
  memoryUpload.single("file"),
  uploadPayment
);

router.post(
  "/",
  auth,
  upload.fields([
    { name: "paymentProof", maxCount: 1 },
    { name: "senderKyc", maxCount: 1 },
  ]),
  uploadProofs
);

module.exports = router;
