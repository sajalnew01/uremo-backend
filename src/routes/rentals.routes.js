/**
 * PATCH_22: Rental Routes (User-facing)
 */

const express = require("express");
const auth = require("../middlewares/auth.middleware");
const {
  createRentalOrder,
  getUserRentals,
  getRentalById,
  cancelRental,
  renewRental,
} = require("../controllers/rentals.controller");

const router = express.Router();

// Create rental order (requires auth)
router.post("/create", auth, createRentalOrder);

// Get user's rentals
router.get("/my", auth, getUserRentals);

// Get single rental by ID
router.get("/:id", auth, getRentalById);

// Cancel rental
router.put("/:id/cancel", auth, cancelRental);

// Renew rental
router.post("/:id/renew", auth, renewRental);

module.exports = router;
