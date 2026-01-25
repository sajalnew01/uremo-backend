const express = require("express");
const router = express.Router();

const { paymentPendingReminders } = require("../controllers/cron.controller");
// PATCH_22: Rental expiry job
const { expireRentalsJob } = require("../controllers/rentals.controller");

// Secret-protected cron endpoint.
// Call: GET /api/cron/payment-pending-reminders?secret=...
router.get("/payment-pending-reminders", paymentPendingReminders);

// PATCH_22: Expire rentals that have passed their end date
// Call: GET /api/cron/expire-rentals?secret=...
router.get("/expire-rentals", expireRentalsJob);

module.exports = router;
