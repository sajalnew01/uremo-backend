const EngagementEvent = require("../models/EngagementEvent");

/**
 * Queue an engagement event for batch processing
 * @param {Object} params
 * @param {String} params.type - Event type (service_new, job_new, deal_new, rental_new, campaign)
 * @param {String} params.title - Event title
 * @param {String} params.message - Event message
 * @param {Array} params.targetTags - Interest tags to target
 */
exports.queueEvent = async ({ type, title, message, targetTags = [] }) => {
  try {
    const event = await EngagementEvent.create({
      type,
      title,
      message,
      targetTags,
    });

    console.log(
      `[Engagement] Queued event: ${type} for tags: ${targetTags.join(", ")}`,
    );
    return event;
  } catch (error) {
    console.error("[Engagement] Error queueing event:", error);
    throw error;
  }
};

/**
 * Get unprocessed events
 */
exports.getUnprocessedEvents = async () => {
  try {
    return await EngagementEvent.find({ processed: false }).sort({
      createdAt: 1,
    });
  } catch (error) {
    console.error("[Engagement] Error fetching unprocessed events:", error);
    throw error;
  }
};

/**
 * Mark event as processed
 */
exports.markEventProcessed = async (eventId, sentCount) => {
  try {
    return await EngagementEvent.findByIdAndUpdate(
      eventId,
      {
        processed: true,
        processedAt: new Date(),
        sentCount,
      },
      { new: true },
    );
  } catch (error) {
    console.error("[Engagement] Error marking event as processed:", error);
    throw error;
  }
};

/**
 * Get user preferences summary
 */
exports.getUserPreferences = (user) => {
  return {
    emailPreferences: user.emailPreferences || {},
    interestTags: user.interestTags || [],
  };
};

/**
 * Check if user should receive email for event type
 */
exports.shouldSendEmail = (user, eventType) => {
  const prefs = user.emailPreferences || {};

  const preferencesMap = {
    service_new: prefs.productUpdates,
    job_new: prefs.jobAlerts,
    deal_new: prefs.dealAlerts,
    rental_new: prefs.rentalAlerts,
    campaign: true, // Campaigns only if user is active
  };

  return preferencesMap[eventType] !== false; // Default to true if not set
};

/**
 * Check if user's interests match event target tags
 */
exports.userMatchesTargetTags = (user, targetTags) => {
  if (!targetTags || targetTags.length === 0) {
    return true; // No specific targeting = send to all
  }

  const userTags = user.interestTags || [];
  if (userTags.length === 0) {
    return false; // User has no interests set
  }

  // Check if any user tags match target tags
  return userTags.some((tag) => targetTags.includes(tag));
};
