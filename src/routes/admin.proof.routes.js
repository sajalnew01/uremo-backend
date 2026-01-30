/**
 * PATCH_48: Admin Proof Routes
 * Manages proof of work review and approval
 */

const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");
const {
  adminGetProofs,
  adminGetProofById,
  adminApproveProof,
  adminRejectProof,
} = require("../controllers/proof.controller");

// All routes require admin auth
router.use(auth, admin);

// GET /api/admin/proofs - List all proofs with filters
router.get("/", adminGetProofs);

// GET /api/admin/proofs/:id - Get single proof
router.get("/:id", adminGetProofById);

// PUT /api/admin/proofs/:id/approve - Approve proof
router.put("/:id/approve", adminApproveProof);

// PUT /api/admin/proofs/:id/reject - Reject proof
router.put("/:id/reject", adminRejectProof);

module.exports = router;
