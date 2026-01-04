const express = require("express");
const auth = require("../middlewares/auth.middleware");
const upload = require("../utils/upload");
const { uploadProofs } = require("../controllers/upload.controller");

const router = express.Router();

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
