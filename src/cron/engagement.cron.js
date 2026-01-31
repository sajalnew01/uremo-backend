const User = require("../models/User");
const engagementService = require("../services/engagement.service");
const resendService = require("../services/resend.service");

/**
 * PATCH_53: Batch email processor cron job
 * Runs every 30 minutes to process queued engagement events
 * Matches users by interests and sends emails respecting preferences
 */
const runEngagementBatch = async () => {
  try {
    console.log("[Engagement Cron] Starting batch processor...");

    const events = await engagementService.getUnprocessedEvents();

    if (events.length === 0) {
      console.log("[Engagement Cron] No unprocessed events found");
      return;
    }

    console.log(`[Engagement Cron] Processing ${events.length} event(s)`);

    for (const event of events) {
      await processEvent(event);
    }

    console.log("[Engagement Cron] Batch processor completed");
  } catch (error) {
    console.error("[Engagement Cron] Fatal error:", error);
  }
};

/**
 * Process a single engagement event
 */
const processEvent = async (event) => {
  try {
    console.log(`[Engagement Cron] Processing event: ${event.type}`);

    let sentCount = 0;

    // Find users matching target tags
    const query = {};

    // If specific tags targeted, find users with matching interests
    if (event.targetTags && event.targetTags.length > 0) {
      query.interestTags = { $in: event.targetTags };
    }

    const users = await User.find(query).lean();
    console.log(
      `[Engagement Cron] Found ${users.length} users for event: ${event.type}`,
    );

    // Send emails to matching users
    for (const user of users) {
      try {
        // Check email preference for this event type
        if (!engagementService.shouldSendEmail(user, event.type)) {
          console.log(
            `[Engagement Cron] User ${user.email} opted out of ${event.type}`,
          );
          continue;
        }

        // Send email via Resend
        await sendEngagementEmail(user, event);
        sentCount++;

        // Create in-app notification (optional)
        // await createNotification(user._id, event);
      } catch (emailError) {
        console.error(
          `[Engagement Cron] Error sending email to ${user.email}:`,
          emailError,
        );
        // Continue to next user even if this one fails
      }
    }

    // Mark event as processed
    await engagementService.markEventProcessed(event._id, sentCount);
    console.log(
      `[Engagement Cron] Event processed. Sent to ${sentCount} users`,
    );
  } catch (error) {
    console.error("[Engagement Cron] Error processing event:", error);
  }
};

/**
 * Send engagement email to user
 */
const sendEngagementEmail = async (user, event) => {
  try {
    const subject = `🎉 ${event.title} - New Opportunity on UREMO`;

    const emailBody = `
      <h2>${event.title}</h2>
      <p>${event.message}</p>
      <p>
        <a href="https://uremo.com" style="background: #6366f1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
          View on UREMO
        </a>
      </p>
      <p style="color: #666; font-size: 12px;">
        You received this because you're interested in: ${event.targetTags.join(", ")}
      </p>
    `;

    // Use Resend service to send email
    await resendService.sendEmail({
      to: user.email,
      subject,
      html: emailBody,
    });

    console.log(`[Engagement] Email sent to ${user.email}`);
  } catch (error) {
    console.error(`[Engagement] Failed to send email to ${user.email}:`, error);
    throw error;
  }
};

module.exports = {
  runEngagementBatch,
};
