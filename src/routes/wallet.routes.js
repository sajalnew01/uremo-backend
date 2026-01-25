/**
 * PATCH_23: Wallet Routes (User)
 * Endpoints for wallet balance, top-up, transactions, and payment
 */
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const walletController = require("../controllers/wallet.controller");

// All routes require authentication
router.use(authMiddleware);

// GET /api/wallet/balance - Get current wallet balance
router.get("/balance", walletController.getBalance);

// POST /api/wallet/topup - Add funds to wallet
router.post("/topup", walletController.topUp);

// GET /api/wallet/transactions - Get transaction history
router.get("/transactions", walletController.getTransactions);

// POST /api/wallet/pay - Pay for order using wallet
router.post("/pay", walletController.payWithWallet);

module.exports = router;
