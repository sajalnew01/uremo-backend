const EngagementEvent = require("../models/EngagementEvent");

const logger = {
  info: (prefix, msg) =>
    console.log(`[${prefix}] ${new Date().toISOString()} ${msg}`),
  warn: (prefix, msg) =>
    console.warn(`[${prefix}] ${new Date().toISOString()} ${msg}`),
  error: (prefix, msg) =>
    console.error(`[${prefix}] ${new Date().toISOString()} ${msg}`),
};

const MAX_TITLE_LENGTH = 500;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_TAGS = 10;
const MAX_BATCH_SIZE = 5000;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const INTEREST_TAG_WHITELIST = [
  "microjobs",
  "forex",
  "wallets",
  "crypto",
  "rentals",
];

const sanitizeHtml = (text) => {
  if (!text) return "";
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
};

const sanitizeString = (str) =>
  String(str || "")
    .substring(0, 1000)
    .trim();

/**
 * Queue an engagement event for batch processing
 * @param {Object} params
 * @param {String} params.type - Event type (service_new, job_new, deal_new, rental_new, campaign)
 * @param {String} params.title - Event title
 * @param {String} params.message - Event message
 * @param {Array} params.targetTags - Interest tags to target
 * @param {String} params.idempotencyKey - Optional key to prevent duplicates
 */
exports.queueEvent = async ({
  type,
  title,
  message,
  targetTags = [],
  idempotencyKey = null,
}) => {
  try {
    if (!type || !title || !message) {
      throw new Error("type, title, and message are required");
    }

    if (String(title).length > MAX_TITLE_LENGTH) {
      throw new Error(`Title exceeds ${MAX_TITLE_LENGTH} characters`);
    }

    if (String(message).length > MAX_MESSAGE_LENGTH) {
      throw new Error(`Message exceeds ${MAX_MESSAGE_LENGTH} characters`);
    }

    if (!Array.isArray(targetTags) || targetTags.length > MAX_TAGS) {
      throw new Error(`targetTags must be array with max ${MAX_TAGS} items`);
    }

    const sanitizedTags = targetTags
      .map((t) => String(t).toLowerCase().trim())
      .filter((t) => INTEREST_TAG_WHITELIST.includes(t));

    if (idempotencyKey) {
      const existing = await EngagementEvent.findOne({ idempotencyKey });
      if (existing) {
        logger.warn(
          "ENGAGEMENT_SERVICE",
          `Duplicate prevented: ${idempotencyKey}`,
        );
        return existing;
      }
    }

    const event = await EngagementEvent.create({
      type,
      title: sanitizeString(title),
      message: sanitizeString(message),
      targetTags: sanitizedTags,
      idempotencyKey,
    });

    logger.info(
      "ENGAGEMENT_SERVICE",
      `Queued event=${event._id} type=${type} tags=${sanitizedTags.join(",")} key=${idempotencyKey || "none"}`,
    );
    return event;
  } catch (error) {
    logger.error("ENGAGEMENT_SERVICE", `queueEvent failed: ${error.message}`);
    throw error;
  }
};

/**
 * Get unprocessed events
 */
exports.getUnprocessedEvents = async () => {
  try {
    const events = await EngagementEvent.find({
      processed: false,
      processingStarted: null,
      failureCount: { $lt: 3 },
    })
      .sort({ createdAt: 1 })
      .limit(MAX_BATCH_SIZE);

    logger.info(
      "ENGAGEMENT_SERVICE",
      `Found ${events.length} unprocessed events`,
    );
    return events;
  } catch (error) {
    logger.error(
      "ENGAGEMENT_SERVICE",
      `getUnprocessedEvents failed: ${error.message}`,
    );
    throw error;
  }
};

/**
 * Acquire atomic lock on event for processing
 */
exports.acquireEventLock = async (eventId) => {
  try {
    const result = await EngagementEvent.findOneAndUpdate(
      {
        _id: eventId,
        processingStarted: null,
      },
      {
        processingStarted: new Date(),
      },
      { new: true },
    );

    return result || null;
  } catch (error) {
    logger.error(
      "ENGAGEMENT_SERVICE",
      `acquireEventLock failed: ${error.message}`,
    );
    return null;
  }
};

/**
 * Mark event as processed
 */
exports.markEventProcessed = async (eventId, sentCount) => {
  try {
    if (typeof sentCount !== "number" || sentCount < 0) {
      throw new Error("sentCount must be non-negative number");
    }

    return await EngagementEvent.findByIdAndUpdate(
      eventId,
      {
        processed: true,
        processedAt: new Date(),
        sentCount,
        processingStarted: null,
        failureCount: 0,
      },
      { new: true },
    );
  } catch (error) {
    logger.error(
      "ENGAGEMENT_SERVICE",
      `markEventProcessed failed: ${error.message}`,
    );
    throw error;
  }
};

/**
 * Record processing failure for retry logic
 */
exports.recordProcessingFailure = async (eventId, error) => {
  try {
    return await EngagementEvent.findByIdAndUpdate(
      eventId,
      {
        $inc: { failureCount: 1 },
        lastError: error.message
          ? error.message.substring(0, 500)
          : "Unknown error",
        processingStarted: null,
      },
      { new: true },
    );
  } catch (err) {
    logger.error(
      "ENGAGEMENT_SERVICE",
      `recordProcessingFailure failed: ${err.message}`,
    );
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
    campaign: true,
  };

  const shouldSend = preferencesMap[eventType];
  if (typeof shouldSend === "boolean") {
    return shouldSend;
  }
  return false;
};

/**
 * Check if user's interests match event target tags
 */
exports.userMatchesTargetTags = (user, targetTags) => {
  if (!targetTags || targetTags.length === 0) {
    return true;
  }

  const userTags = user.interestTags || [];
  if (userTags.length === 0) {
    return false;
  }

  return userTags.some((tag) => targetTags.includes(tag));
};

exports.sanitizeHtml = sanitizeHtml;
