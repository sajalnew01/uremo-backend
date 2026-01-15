const express = require("express");

const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");
const JarvisWrite = require("../controllers/jarvisxWrite.controller");

const router = express.Router();

// Admin-only health
router.get("/health", auth, admin, JarvisWrite.health);

// Propose (admin-only)
router.post(
  "/propose",
  auth,
  admin,
  JarvisWrite.proposeLimiter,
  JarvisWrite.propose
);

// Proposals
router.get("/proposals", auth, admin, JarvisWrite.listProposals);
router.get("/proposals/:id", auth, admin, JarvisWrite.getProposal);
router.post(
  "/proposals/:id/approve",
  auth,
  admin,
  JarvisWrite.approveAndExecute
);
router.post("/proposals/:id/reject", auth, admin, JarvisWrite.reject);

module.exports = router;
