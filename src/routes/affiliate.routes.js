/**
 * PATCH_23: Affiliate Routes (User-facing)
 */

const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const affiliateController = require("../controllers/affiliate.controller");

// All routes require authentication
router.use(authMiddleware);

// Get affiliate stats
router.get("/stats", affiliateController.getMyAffiliateStats);

// Get affiliate transactions
router.get("/transactions", affiliateController.getMyAffiliateTransactions);

// Get withdrawal history
router.get("/withdrawals", affiliateController.getMyWithdrawals);

// Request withdrawal
router.post("/withdraw", affiliateController.withdrawAffiliateBalance);

module.exports = router;
