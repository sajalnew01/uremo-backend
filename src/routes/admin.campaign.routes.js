const express = require("express");
const router = express.Router();
const engagementService = require("../services/engagement.service");
const adminMiddleware = require("../middlewares/admin.middleware");

/**
 * PATCH_53: Admin Campaign Routes
 */

/**
 * POST /api/admin/campaigns/send
 * Send a campaign to users matching interest tags
 * Admin only
 */
router.post("/send", adminMiddleware, async (req, res) => {
  try {
    const { title, message, targetTags } = req.body;

    // Validation
    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: "Title and message are required",
      });
    }

    // Create engagement event
    const event = await engagementService.queueEvent({
      type: "campaign",
      title,
      message,
      targetTags: targetTags || [],
    });

    res.status(201).json({
      success: true,
      message: "Campaign queued successfully",
      data: {
        eventId: event._id,
        type: event.type,
        targetTags: event.targetTags,
      },
    });
  } catch (error) {
    console.error("[Admin Campaign] Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send campaign",
    });
  }
});

/**
 * GET /api/admin/campaigns/events
 * Get all engagement events (admin dashboard)
 */
router.get("/events", adminMiddleware, async (req, res) => {
  try {
    const EngagementEvent = require("../models/EngagementEvent");

    const events = await EngagementEvent.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      data: events,
    });
  } catch (error) {
    console.error("[Admin Campaign] Error fetching events:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch events",
    });
  }
});

module.exports = router;
