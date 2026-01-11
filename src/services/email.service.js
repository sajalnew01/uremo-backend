const { Resend } = require("resend");

const DEFAULT_ADMIN_EMAIL = "sajalnew01@gmail.com";

function parseEmailList(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getAdminEmails() {
  const list = parseEmailList(process.env.ADMIN_EMAIL);
  return list.length ? list : [DEFAULT_ADMIN_EMAIL];
}

async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const err = new Error("RESEND_API_KEY is not set");
    err.code = "EMAIL_CONFIG_MISSING";
    throw err;
  }

  const from = process.env.EMAIL_FROM || "UREMO <onboarding@resend.dev>";

  if (!to) {
    const err = new Error("Email 'to' is required");
    err.code = "EMAIL_INVALID_TO";
    throw err;
  }

  if (!subject) {
    const err = new Error("Email 'subject' is required");
    err.code = "EMAIL_INVALID_SUBJECT";
    throw err;
  }

  if (!html && !text) {
    const err = new Error("Email requires 'html' or 'text'");
    err.code = "EMAIL_INVALID_CONTENT";
    throw err;
  }

  const resend = new Resend(apiKey);

  try {
    const result = await resend.emails.send({
      from,
      to,
      subject,
      ...(html ? { html } : {}),
      ...(text ? { text } : {}),
    });

    const id = result?.data?.id || result?.id;
    console.log("[email] sent", { to, subject, id });
    return result;
  } catch (error) {
    const message = error?.message || String(error);
    console.error("[email] failed", { to, subject, message });
    const err = new Error(`Failed to send email: ${message}`);
    err.cause = error;
    err.code = "EMAIL_SEND_FAILED";
    throw err;
  }
}

module.exports = {
  sendEmail,
  getAdminEmails,
};
