const EmailCampaign = require("../models/EmailCampaign");
const User = require("../models/User");
const Order = require("../models/Order");
const ApplyWork = require("../models/ApplyWork");
const WorkerApplication = require("../models/WorkerApplication");

const { sendEmail } = require("../services/email.service");

const RECIPIENT_HARD_LIMIT = 300;
const BATCH_SIZE = 50;
const MAX_CAMPAIGNS_PER_HOUR_PER_ADMIN = 3;

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isValidEmail(value) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseCustomEmails(value) {
  const input = String(value || "");
  const parts = input
    .split(/[\n,\r]+/)
    .map((s) => normalizeEmail(s))
    .filter(Boolean);

  const unique = Array.from(new Set(parts));
  return unique.filter(isValidEmail);
}

function enforceRecipientLimit(list) {
  if (list.length > RECIPIENT_HARD_LIMIT) {
    const err = new Error(
      `Too many recipients. Max ${RECIPIENT_HARD_LIMIT} per campaign.`
    );
    err.status = 400;
    throw err;
  }
}

async function selectRecipients({ audience, customEmails }) {
  const limitPlusOne = RECIPIENT_HARD_LIMIT + 1;

  if (audience === "custom") {
    const cleaned = Array.from(
      new Set((customEmails || []).map(normalizeEmail).filter(isValidEmail))
    );
    enforceRecipientLimit(cleaned);
    return cleaned;
  }

  if (audience === "all") {
    const users = await User.find({ email: { $exists: true, $ne: "" } })
      .select("email")
      .limit(limitPlusOne)
      .lean();

    const emails = Array.from(
      new Set(users.map((u) => normalizeEmail(u.email)).filter(isValidEmail))
    );
    enforceRecipientLimit(emails);
    return emails;
  }

  if (audience === "buyers") {
    const rows = await Order.aggregate([
      { $group: { _id: "$userId" } },
      { $limit: limitPlusOne },
    ]);

    const ids = rows.map((r) => r._id).filter(Boolean);
    enforceRecipientLimit(ids);

    const users = await User.find({ _id: { $in: ids }, email: { $ne: "" } })
      .select("email")
      .lean();

    const emails = Array.from(
      new Set(users.map((u) => normalizeEmail(u.email)).filter(isValidEmail))
    );
    enforceRecipientLimit(emails);
    return emails;
  }

  if (audience === "workers") {
    const rowsA = await ApplyWork.aggregate([
      { $group: { _id: "$user" } },
      { $limit: limitPlusOne },
    ]);

    const rowsB = await WorkerApplication.aggregate([
      { $group: { _id: "$userId" } },
      { $limit: limitPlusOne },
    ]);

    const unionIds = Array.from(
      new Set([
        ...rowsA.map((r) => r._id).filter(Boolean),
        ...rowsB.map((r) => r._id).filter(Boolean),
      ])
    );

    enforceRecipientLimit(unionIds);

    const users = await User.find({
      _id: { $in: unionIds },
      email: { $ne: "" },
    })
      .select("email")
      .lean();

    const emails = Array.from(
      new Set(users.map((u) => normalizeEmail(u.email)).filter(isValidEmail))
    );
    enforceRecipientLimit(emails);
    return emails;
  }

  const err = new Error("Invalid audience");
  err.status = 400;
  throw err;
}

async function sendCampaignInBackground(campaignId) {
  try {
    const campaign = await EmailCampaign.findById(campaignId).lean();
    if (!campaign) return;
    if (campaign.sentAt) return;

    const recipients = await selectRecipients({
      audience: campaign.audience,
      customEmails: campaign.customEmails,
    });

    let cursor = 0;

    const processNextBatch = async () => {
      const batch = recipients.slice(cursor, cursor + BATCH_SIZE);
      if (!batch.length) {
        await EmailCampaign.findByIdAndUpdate(campaignId, {
          $set: { sentAt: new Date() },
        }).catch(() => null);
        return;
      }

      const results = await Promise.allSettled(
        batch.map((to) =>
          sendEmail({
            to,
            subject: campaign.subject,
            html: campaign.htmlContent,
          })
        )
      );

      const sent = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - sent;

      await EmailCampaign.findByIdAndUpdate(campaignId, {
        $inc: {
          "stats.totalSent": sent,
          "stats.totalFailed": failed,
        },
      }).catch(() => null);

      cursor += BATCH_SIZE;
      setImmediate(() => {
        processNextBatch().catch((err) => {
          console.error("[email-campaign] batch failed", {
            campaignId: String(campaignId),
            message: err?.message || String(err),
          });
        });
      });
    };

    await processNextBatch();
  } catch (err) {
    console.error("[email-campaign] background send failed", {
      campaignId: String(campaignId),
      message: err?.message || String(err),
    });
  }
}

exports.createEmailCampaign = async (req, res) => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await EmailCampaign.countDocuments({
      createdBy: req.user.id,
      createdAt: { $gte: oneHourAgo },
    });

    if (recentCount >= MAX_CAMPAIGNS_PER_HOUR_PER_ADMIN) {
      return res.status(429).json({
        message: "Rate limit: too many campaigns created recently. Try later.",
      });
    }

    const { subject, htmlContent, audience, customEmails } = req.body || {};

    const cleanSubject = String(subject || "").trim();
    const cleanHtml = String(htmlContent || "").trim();
    const cleanAudience = String(audience || "").trim();

    if (!cleanSubject) {
      return res.status(400).json({ message: "subject is required" });
    }

    if (!cleanHtml) {
      return res.status(400).json({ message: "htmlContent is required" });
    }

    if (!["all", "buyers", "workers", "custom"].includes(cleanAudience)) {
      return res.status(400).json({ message: "Invalid audience" });
    }

    let campaignCustomEmails = [];
    if (cleanAudience === "custom") {
      const parsed = Array.isArray(customEmails)
        ? customEmails.map(normalizeEmail)
        : parseCustomEmails(customEmails);

      campaignCustomEmails = Array.from(new Set(parsed)).filter(isValidEmail);

      if (!campaignCustomEmails.length) {
        return res
          .status(400)
          .json({ message: "customEmails is required for custom audience" });
      }

      enforceRecipientLimit(campaignCustomEmails);
    }

    // Determine totalTargeted (also enforces hard limit).
    const recipients = await selectRecipients({
      audience: cleanAudience,
      customEmails: campaignCustomEmails,
    });

    const campaign = await EmailCampaign.create({
      subject: cleanSubject,
      htmlContent: cleanHtml,
      audience: cleanAudience,
      customEmails: campaignCustomEmails,
      createdBy: req.user.id,
      stats: {
        totalTargeted: recipients.length,
        totalSent: 0,
        totalFailed: 0,
      },
    });

    // Non-blocking send.
    setImmediate(() => {
      sendCampaignInBackground(campaign._id).catch(() => null);
    });

    return res.json({
      campaignId: campaign._id,
      totalTargeted: recipients.length,
      message: "Campaign created, sending in background",
    });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
};

exports.listEmailCampaigns = async (req, res) => {
  try {
    const campaigns = await EmailCampaign.find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .select("subject audience createdAt sentAt stats createdBy")
      .populate({ path: "createdBy", select: "email name" })
      .lean();

    return res.json(campaigns);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
