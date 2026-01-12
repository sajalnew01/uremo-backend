const express = require("express");
const {
  signup,
  login,
  makeAdmin,
  resetPasswordWithSecret,
} = require("../controllers/auth.controller");

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/make-admin", makeAdmin);
router.post("/setup/reset-password", resetPasswordWithSecret);

module.exports = router;
