/**
 * PATCH_49: Public Proof Routes
 * Public-facing proof of work endpoints (no auth required)
 */

const router = require("express").Router();
const { getPublicProofs } = require("../controllers/proof.controller");

// GET /api/proofs/public - Get verified public proofs for showcase
router.get("/public", getPublicProofs);

module.exports = router;
