const express = require("express");
const {
  signup,
  login,
  makeAdmin,
  resetPasswordWithSecret,
  getProfile,
  updateOnboarding,
} = require("../controllers/auth.controller");
const auth = require("../middlewares/auth.middleware");

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/make-admin", makeAdmin);
router.post("/setup/reset-password", resetPasswordWithSecret);
router.get("/me", auth, getProfile);
router.get("/profile", auth, getProfile);
// PATCH_34: Onboarding wizard endpoint
router.put("/onboarding", auth, updateOnboarding);

module.exports = router;
