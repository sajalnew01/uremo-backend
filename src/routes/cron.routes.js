const express = require("express");
const router = express.Router();

const { paymentPendingReminders } = require("../controllers/cron.controller");

// Secret-protected cron endpoint.
// Call: GET /api/cron/payment-pending-reminders?secret=...
router.get("/payment-pending-reminders", paymentPendingReminders);

module.exports = router;
