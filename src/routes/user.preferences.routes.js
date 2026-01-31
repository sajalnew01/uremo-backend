const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const User = require("../models/User");

/**
 * PATCH_53: User Preferences Routes
 */

/**
 * GET /api/users/preferences
 * Get current user's email preferences and interests
 */
router.get("/preferences", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "emailPreferences interestTags",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: {
        emailPreferences: user.emailPreferences || {},
        interestTags: user.interestTags || [],
      },
    });
  } catch (error) {
    console.error("[User Preferences] Error getting preferences:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch preferences",
    });
  }
});

/**
 * PUT /api/users/preferences
 * Update user's email preferences and interests
 */
router.put("/preferences", auth, async (req, res) => {
  try {
    const { emailPreferences, interestTags } = req.body;

    // Validation
    if (emailPreferences && typeof emailPreferences !== "object") {
      return res.status(400).json({
        success: false,
        message: "emailPreferences must be an object",
      });
    }

    if (interestTags && !Array.isArray(interestTags)) {
      return res.status(400).json({
        success: false,
        message: "interestTags must be an array",
      });
    }

    // Update user
    const updateData = {};
    if (emailPreferences) {
      updateData.emailPreferences = emailPreferences;
    }
    if (interestTags) {
      updateData.interestTags = interestTags;
    }

    const user = await User.findByIdAndUpdate(req.user.id, updateData, {
      new: true,
    }).select("emailPreferences interestTags");

    res.json({
      success: true,
      message: "Preferences updated successfully",
      data: {
        emailPreferences: user.emailPreferences,
        interestTags: user.interestTags,
      },
    });
  } catch (error) {
    console.error("[User Preferences] Error updating preferences:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update preferences",
    });
  }
});

module.exports = router;
