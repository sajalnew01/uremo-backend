/**
 * PATCH_22: Admin Rental Routes
 * PATCH_109: Added metrics endpoint
 */

const express = require("express");
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");
const {
  getAdminRentals,
  activateRental,
  cancelRental,
  updateRentalAccess,
  getRentalMetrics,
} = require("../controllers/rentals.controller");

const router = express.Router();

// PATCH_109: Rental revenue intelligence metrics (must be before /:id routes)
router.get("/metrics", auth, admin, getRentalMetrics);

// Get all rentals (admin)
router.get("/", auth, admin, getAdminRentals);

// Activate rental after payment
router.put("/:id/activate", auth, admin, activateRental);

// Cancel rental (admin)
router.put("/:id/cancel", auth, admin, cancelRental);

// Update access details
router.put("/:id/access", auth, admin, updateRentalAccess);

module.exports = router;
