/**
 * PATCH_58: Smart Engagement Engine
 * Human & Trust-First engagement system
 *
 * Core Principles:
 * - NO aggressive marketing
 * - NO fake urgency
 * - Max 1 email per user per 48-72 hours
 * - In-app notifications are PRIMARY
 * - Email is SECONDARY (only when user inactive)
 */

const User = require("../models/User");
const ApplyWork = require("../models/ApplyWork");
const Order = require("../models/Order");
const Notification = require("../models/Notification");
const { sendEmail } = require("./email.service");

const logger = {
  info: (msg) => console.log(`[ENGAGEMENT] ${new Date().toISOString()} ${msg}`),
  warn: (msg) =>
    console.warn(`[ENGAGEMENT] ${new Date().toISOString()} ${msg}`),
  error: (msg) =>
    console.error(`[ENGAGEMENT] ${new Date().toISOString()} ${msg}`),
};

// Constants
const MIN_EMAIL_INTERVAL_HOURS = 48; // Minimum hours between engagement emails
const SIGNUP_NUDGE_DELAY_HOURS = 48; // Hours after signup before first nudge
const SCREENING_NUDGE_DELAY_HOURS = 24; // Hours after screening unlocked

/**
 * Check if user can receive engagement email
 */
const canSendEngagementEmail = (user) => {
  // Check user email preferences
  if (!user.emailPreferences?.productUpdates) {
    return false;
  }

  // Check last engagement email timestamp
  if (user.lastEngagementEmail) {
    const hoursSinceLastEmail =
      (Date.now() - new Date(user.lastEngagementEmail).getTime()) /
      (1000 * 60 * 60);
    if (hoursSinceLastEmail < MIN_EMAIL_INTERVAL_HOURS) {
      return false;
    }
  }

  return true;
};

/**
 * Check if user has been active recently
 */
const isUserActive = (user) => {
  if (!user.lastLogin) return false;
  const hoursSinceLogin =
    (Date.now() - new Date(user.lastLogin).getTime()) / (1000 * 60 * 60);
  return hoursSinceLogin < 24; // Active if logged in within 24 hours
};

/**
 * Create in-app notification
 */
const createNotification = async (userId, title, message, type = "system") => {
  try {
    return await Notification.create({
      user: userId,
      title,
      message,
      type,
    });
  } catch (error) {
    logger.error(`Failed to create notification: ${error.message}`);
    return null;
  }
};

/**
 * Send engagement email with tracking
 */
const sendEngagementEmail = async (user, subject, message, ctaText, ctaUrl) => {
  try {
    const frontendUrl = process.env.FRONTEND_URL || "https://uremo.online";
    const fullCtaUrl = ctaUrl.startsWith("http")
      ? ctaUrl
      : `${frontendUrl}${ctaUrl}`;

    await sendEmail({
      to: user.email,
      subject: `${subject}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 32px; border-radius: 16px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #10b981; font-size: 24px; margin: 0;">UREMO</h1>
          </div>
          
          <h2 style="color: #f8fafc; font-size: 20px; margin-bottom: 16px;">${subject}</h2>
          
          <p style="color: #94a3b8; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
            Hi ${user.name?.split(" ")[0] || "there"},
          </p>
          
          <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6; margin-bottom: 32px;">
            ${message}
          </p>
          
          <div style="text-align: center; margin-bottom: 32px;">
            <a href="${fullCtaUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: white; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 16px;">
              ${ctaText}
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #334155; margin: 24px 0;" />
          
          <p style="color: #64748b; font-size: 12px; text-align: center;">
            You're receiving this because you signed up for UREMO.<br/>
            <a href="${frontendUrl}/profile" style="color: #10b981;">Manage notification preferences</a>
          </p>
        </div>
      `,
      text: `${subject}\n\nHi ${user.name?.split(" ")[0] || "there"},\n\n${message}\n\n${ctaText}: ${fullCtaUrl}`,
    });

    // Update user's last engagement email timestamp
    await User.findByIdAndUpdate(user._id, {
      lastEngagementEmail: new Date(),
      "engagementNudges.lastNudgeAt": new Date(),
    });

    logger.info(`Engagement email sent to ${user.email}`);
    return true;
  } catch (error) {
    logger.error(`Failed to send engagement email: ${error.message}`);
    return false;
  }
};

/**
 * RULE 1: Signup → No Action
 * Trigger: User signed up, no orders, no applications, no wallet activity
 * Timing: After 48-72 hours
 */
const processSignupNudge = async () => {
  const cutoffTime = new Date(
    Date.now() - SIGNUP_NUDGE_DELAY_HOURS * 60 * 60 * 1000,
  );
  const maxCutoff = new Date(
    Date.now() - (SIGNUP_NUDGE_DELAY_HOURS + 24) * 60 * 60 * 1000,
  );

  try {
    // Find users who signed up 48-72 hours ago and haven't received signup nudge
    const users = await User.find({
      createdAt: { $gte: maxCutoff, $lte: cutoffTime },
      "engagementNudges.signupNudgeSent": { $ne: true },
      role: "user",
    })
      .select(
        "_id name email lastLogin emailPreferences engagementNudges lastEngagementEmail",
      )
      .limit(50);

    let processed = 0;
    let notified = 0;
    let emailed = 0;

    for (const user of users) {
      // Check if user has any meaningful activity
      const [ordersCount, applicationsCount] = await Promise.all([
        Order.countDocuments({ user: user._id }),
        ApplyWork.countDocuments({ user: user._id }),
      ]);

      if (ordersCount > 0 || applicationsCount > 0) {
        // User is active, mark nudge as sent (no need to send)
        await User.findByIdAndUpdate(user._id, {
          "engagementNudges.signupNudgeSent": true,
        });
        processed++;
        continue;
      }

      // Send in-app notification
      await createNotification(
        user._id,
        "Need help getting started? 🚀",
        "Welcome to UREMO! Explore services you can buy, or apply to work and start earning. We're here to help you succeed.",
        "system",
      );
      notified++;

      // Send email ONLY if user hasn't logged in recently
      if (!isUserActive(user) && canSendEngagementEmail(user)) {
        await sendEngagementEmail(
          user,
          "Need help getting started on UREMO?",
          "We noticed you haven't explored UREMO yet. Whether you want to buy professional services or earn money by working on tasks — we've got you covered.",
          "Explore UREMO",
          "/dashboard",
        );
        emailed++;
      }

      // Mark nudge as sent
      await User.findByIdAndUpdate(user._id, {
        "engagementNudges.signupNudgeSent": true,
        "engagementNudges.lastNudgeType": "signup",
        "engagementNudges.lastNudgeAt": new Date(),
      });

      processed++;
    }

    logger.info(
      `Signup nudge: processed=${processed}, notified=${notified}, emailed=${emailed}`,
    );
    return { processed, notified, emailed };
  } catch (error) {
    logger.error(`processSignupNudge failed: ${error.message}`);
    throw error;
  }
};

/**
 * RULE 2: Worker Applied → Screening Pending
 * Trigger: Applied to work, screening unlocked but not completed
 * Timing: 24 hours after unlock
 */
const processScreeningNudge = async () => {
  const cutoffTime = new Date(
    Date.now() - SCREENING_NUDGE_DELAY_HOURS * 60 * 60 * 1000,
  );

  try {
    // Find applications where screening was unlocked > 24 hours ago
    const pendingScreenings = await ApplyWork.find({
      workerStatus: { $in: ["screening_unlocked", "training_viewed"] },
      updatedAt: { $lte: cutoffTime },
    })
      .populate(
        "user",
        "name email emailPreferences engagementNudges lastEngagementEmail lastLogin",
      )
      .limit(50);

    let processed = 0;
    let notified = 0;

    for (const application of pendingScreenings) {
      const user = application.user;
      if (!user) continue;

      // Skip if already sent screening nudge recently
      if (
        user.engagementNudges?.lastNudgeType === "screening" &&
        user.engagementNudges?.lastNudgeAt
      ) {
        const hoursSinceNudge =
          (Date.now() - new Date(user.engagementNudges.lastNudgeAt).getTime()) /
          (1000 * 60 * 60);
        if (hoursSinceNudge < 72) {
          continue;
        }
      }

      // Send in-app notification ONLY (per spec)
      await createNotification(
        user._id,
        "Complete your screening 📋",
        `Your screening for "${application.positionTitle || "work position"}" is waiting. Complete it to move forward and start earning.`,
        "workspace",
      );
      notified++;

      // Update nudge tracking
      await User.findByIdAndUpdate(user._id, {
        "engagementNudges.screeningNudgeSent": true,
        "engagementNudges.lastNudgeType": "screening",
        "engagementNudges.lastNudgeAt": new Date(),
      });

      processed++;
    }

    logger.info(
      `Screening nudge: processed=${processed}, notified=${notified}`,
    );
    return { processed, notified };
  } catch (error) {
    logger.error(`processScreeningNudge failed: ${error.message}`);
    throw error;
  }
};

/**
 * RULE 3: Screening Passed → No Project
 * Called when new project/job is created
 */
const notifyReadyWorkers = async (jobTitle, jobCategory, jobId) => {
  try {
    // Find workers who are ready but have no assigned projects
    const readyWorkers = await ApplyWork.find({
      workerStatus: "ready_to_work",
    }).populate(
      "user",
      "name email emailPreferences engagementNudges lastEngagementEmail",
    );

    let notified = 0;
    let emailed = 0;

    for (const application of readyWorkers) {
      const user = application.user;
      if (!user) continue;

      // Check if user's job alerts are enabled
      if (!user.emailPreferences?.jobAlerts) continue;

      // Send in-app notification
      await createNotification(
        user._id,
        "New work opportunity! 💼",
        `A new "${jobTitle}" position is available. Check it out and start earning.`,
        "workspace",
      );
      notified++;

      // Send email if allowed
      if (canSendEngagementEmail(user)) {
        await sendEngagementEmail(
          user,
          "New work opportunity available",
          `We have a new "${jobTitle}" position that matches your skills. This could be a great opportunity for you to start earning.`,
          "View Projects",
          "/workspace",
        );
        emailed++;
      }
    }

    logger.info(
      `Ready workers notified for job "${jobTitle}": notified=${notified}, emailed=${emailed}`,
    );
    return { notified, emailed };
  } catch (error) {
    logger.error(`notifyReadyWorkers failed: ${error.message}`);
    throw error;
  }
};

/**
 * RULE 4: New Service in User Interest
 * Called when admin creates a new service
 */
const notifyInterestedUsers = async (
  serviceTitle,
  serviceCategory,
  serviceId,
) => {
  try {
    // Map category to interest tags
    const categoryTagMap = {
      microjobs: "microjobs",
      forex: "forex",
      crypto: "crypto",
      wallets: "wallets",
      rentals: "rentals",
    };

    const matchingTag = categoryTagMap[serviceCategory?.toLowerCase()];

    // Find users interested in this category
    const query = {
      role: "user",
      "emailPreferences.productUpdates": true,
    };

    if (matchingTag) {
      query.interestTags = matchingTag;
    }

    const users = await User.find(query)
      .select(
        "name email emailPreferences lastEngagementEmail engagementNudges",
      )
      .limit(100);

    let notified = 0;
    let emailed = 0;

    for (const user of users) {
      // Send in-app notification
      await createNotification(
        user._id,
        "New service you might like ✨",
        `Check out "${serviceTitle}" — a new service just added to UREMO that matches your interests.`,
        "system",
      );
      notified++;

      // Batch emails (only send if can)
      if (canSendEngagementEmail(user)) {
        await sendEngagementEmail(
          user,
          "New service added you might find useful",
          `We just added "${serviceTitle}" to UREMO. Based on your interests, we thought you'd like to know.`,
          "View Service",
          `/services/${serviceId || ""}`,
        );
        emailed++;
      }
    }

    logger.info(
      `Interested users notified for service "${serviceTitle}": notified=${notified}, emailed=${emailed}`,
    );
    return { notified, emailed };
  } catch (error) {
    logger.error(`notifyInterestedUsers failed: ${error.message}`);
    throw error;
  }
};

/**
 * Run all engagement rules (cron job)
 */
const runEngagementCycle = async () => {
  logger.info("Starting engagement cycle...");

  const results = {
    signupNudge: null,
    screeningNudge: null,
    errors: [],
  };

  try {
    results.signupNudge = await processSignupNudge();
  } catch (error) {
    results.errors.push({ rule: "signupNudge", error: error.message });
  }

  try {
    results.screeningNudge = await processScreeningNudge();
  } catch (error) {
    results.errors.push({ rule: "screeningNudge", error: error.message });
  }

  logger.info(`Engagement cycle complete: ${JSON.stringify(results)}`);
  return results;
};

/**
 * Update user's last login timestamp
 */
const updateLastLogin = async (userId) => {
  try {
    await User.findByIdAndUpdate(userId, {
      lastLogin: new Date(),
    });
  } catch (error) {
    logger.error(`Failed to update lastLogin: ${error.message}`);
  }
};

module.exports = {
  canSendEngagementEmail,
  isUserActive,
  createNotification,
  sendEngagementEmail,
  processSignupNudge,
  processScreeningNudge,
  notifyReadyWorkers,
  notifyInterestedUsers,
  runEngagementCycle,
  updateLastLogin,
};
