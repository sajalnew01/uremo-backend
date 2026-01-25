/**
 * PATCH_23: Admin Wallet Routes
 * Admin endpoints for managing user wallets
 */
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const adminMiddleware = require("../middlewares/admin.middleware");
const walletController = require("../controllers/wallet.controller");

// All routes require authentication + admin
router.use(authMiddleware);
router.use(adminMiddleware);

// GET /api/admin/wallet/stats - Get wallet statistics
router.get("/stats", walletController.adminGetStats);

// GET /api/admin/wallet/search - Search users
router.get("/search", walletController.adminSearchUsers);

// GET /api/admin/wallet/user/:userId - Get user wallet details
router.get("/user/:userId", walletController.adminGetUserWallet);

// POST /api/admin/wallet/adjust - Adjust user balance
router.post("/adjust", walletController.adminAdjustBalance);

module.exports = router;
