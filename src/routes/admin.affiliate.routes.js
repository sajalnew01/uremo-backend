/**
 * PATCH_23: Admin Affiliate Routes
 */

const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const adminMiddleware = require("../middlewares/admin.middleware");
const affiliateController = require("../controllers/affiliate.controller");

// All routes require auth + admin
router.use(authMiddleware);
router.use(adminMiddleware);

// Get all affiliates (Affiliate Directory)
router.get("/affiliates", affiliateController.getAdminAffiliates);

// Get single affiliate details
router.get("/affiliates/:id", affiliateController.getAdminAffiliateById);

// Get all affiliate transactions
router.get("/transactions", affiliateController.getAdminTransactions);

// Get all withdrawal requests
router.get("/withdrawals", affiliateController.getAdminWithdrawals);

// Approve withdrawal
router.put("/withdrawals/:id/approve", affiliateController.approveWithdrawal);

// Reject withdrawal
router.put("/withdrawals/:id/reject", affiliateController.rejectWithdrawal);

module.exports = router;
