function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function humanizeCategory(category) {
  const c = String(category || "").trim();
  if (!c) return "General";
  return c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function baseLayout({ title, preheader, bodyHtml }) {
  const safeTitle = escapeHtml(title);
  const safePreheader = escapeHtml(preheader || "");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;padding:0;background:#070A12;color:#E5E7EB;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${safePreheader}
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#070A12;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;">
            <tr>
              <td style="padding:0 0 14px 0;">
                <div style="font-weight:700;letter-spacing:0.2px;font-size:14px;color:#A7B0C0;">UREMO</div>
              </td>
            </tr>

            <tr>
              <td style="border:1px solid rgba(255,255,255,0.10);border-radius:18px;background:linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03));padding:22px;">
                ${bodyHtml}
              </td>
            </tr>

            <tr>
              <td style="padding:14px 4px 0 4px;color:#94A3B8;font-size:12px;line-height:18px;">
                <div style="margin-bottom:6px;">This is an automated message from UREMO.</div>
                <div>If you did not request this, you can ignore this email.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function primaryButton({ href, label }) {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `
    <a href="${safeHref}" target="_blank" rel="noreferrer" style="display:inline-block;background:#7C3AED;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 16px;border-radius:12px;">
      ${safeLabel}
    </a>
  `;
}

function kvRow(label, value) {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
        <div style="color:#93A4B8;font-size:12px;">${escapeHtml(label)}</div>
        <div style="color:#E5E7EB;font-size:14px;font-weight:600;">${escapeHtml(
          value
        )}</div>
      </td>
    </tr>
  `;
}

function welcomeEmail({ name }) {
  const browseUrl = "https://uremo.online/buy-service";

  const bodyHtml = `
    <h1 style="margin:0 0 8px 0;font-size:24px;line-height:30px;color:#FFFFFF;">Welcome to UREMO</h1>
    <p style="margin:0 0 16px 0;color:#B6C2D6;font-size:14px;line-height:22px;">
      Hi ${escapeHtml(
        name || "there"
      )}, your account is ready. UREMO is a <b>manual, secure, verified</b> service desk.
    </p>

    <div style="margin:0 0 14px 0;padding:14px;border-radius:14px;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.08);">
      <div style="font-weight:700;margin:0 0 8px 0;">What we help with</div>
      <ul style="margin:0;padding-left:18px;color:#D6DEF0;font-size:14px;line-height:22px;">
        <li>Outlier onboarding</li>
        <li>Handshake verification</li>
        <li>Airtm assistance</li>
        <li>Binance / Crypto account support</li>
        <li>KYC + Screening support</li>
      </ul>
    </div>

    <div style="margin-top:18px;">${primaryButton({
      href: browseUrl,
      label: "Browse Services",
    })}</div>
  `;

  return baseLayout({
    title: "Welcome to UREMO",
    preheader: "Welcome to UREMO — browse verified services.",
    bodyHtml,
  });
}

function paymentSubmittedEmail({ name, orderId, serviceTitle }) {
  const bodyHtml = `
    <h1 style="margin:0 0 8px 0;font-size:22px;line-height:28px;color:#FFFFFF;">Payment proof received</h1>
    <p style="margin:0 0 14px 0;color:#B6C2D6;font-size:14px;line-height:22px;">
      Hi ${escapeHtml(
        name || "there"
      )}, we received your payment proof. Our team will review it and update your order shortly.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:8px;">
      ${kvRow("Order ID", orderId)}
      ${kvRow("Service", serviceTitle)}
      ${kvRow("Status", "Payment Submitted (Awaiting Verification)")}
    </table>
  `;

  return baseLayout({
    title: "Payment proof received",
    preheader: "We received your payment proof — review in progress.",
    bodyHtml,
  });
}

function orderStatusEmail({ name, orderId, serviceTitle, newStatus }) {
  const bodyHtml = `
    <h1 style="margin:0 0 8px 0;font-size:22px;line-height:28px;color:#FFFFFF;">Order status updated</h1>
    <p style="margin:0 0 14px 0;color:#B6C2D6;font-size:14px;line-height:22px;">
      Hi ${escapeHtml(name || "there")}, your order status has been updated.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:8px;">
      ${kvRow("Order ID", orderId)}
      ${kvRow("Service", serviceTitle)}
      ${kvRow("New Status", newStatus)}
    </table>
  `;

  return baseLayout({
    title: "Order status updated",
    preheader: `Your order status is now ${escapeHtml(newStatus)}`,
    bodyHtml,
  });
}

function applicationSubmittedEmail({ name, category }) {
  const bodyHtml = `
    <h1 style="margin:0 0 8px 0;font-size:22px;line-height:28px;color:#FFFFFF;">Application submitted</h1>
    <p style="margin:0 0 14px 0;color:#B6C2D6;font-size:14px;line-height:22px;">
      Hi ${escapeHtml(
        name || "there"
      )}, your application has been received. Our team reviews applications manually.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:8px;">
      ${kvRow("Category", humanizeCategory(category))}
      ${kvRow("Status", "Submitted (Under Review)")}
    </table>
  `;

  return baseLayout({
    title: "Application submitted",
    preheader: "Your application has been received and is under review.",
    bodyHtml,
  });
}

function adminPaymentAlertEmail({ userEmail, orderId, serviceTitle }) {
  const bodyHtml = `
    <h1 style="margin:0 0 8px 0;font-size:22px;line-height:28px;color:#FFFFFF;">Admin alert: payment proof submitted</h1>
    <p style="margin:0 0 14px 0;color:#B6C2D6;font-size:14px;line-height:22px;">
      A user submitted payment proof. Please review and verify.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:8px;">
      ${kvRow("User", userEmail)}
      ${kvRow("Order ID", orderId)}
      ${kvRow("Service", serviceTitle)}
    </table>
  `;

  return baseLayout({
    title: "Admin: payment proof submitted",
    preheader: "Payment proof submitted — review required.",
    bodyHtml,
  });
}

function adminApplicationAlertEmail({ userEmail, category }) {
  const bodyHtml = `
    <h1 style="margin:0 0 8px 0;font-size:22px;line-height:28px;color:#FFFFFF;">Admin alert: new application</h1>
    <p style="margin:0 0 14px 0;color:#B6C2D6;font-size:14px;line-height:22px;">
      A new apply-to-work submission was received.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:8px;">
      ${kvRow("User", userEmail)}
      ${kvRow("Category", humanizeCategory(category))}
    </table>
  `;

  return baseLayout({
    title: "Admin: new application",
    preheader: "New apply-to-work submission received.",
    bodyHtml,
  });
}

module.exports = {
  welcomeEmail,
  paymentSubmittedEmail,
  orderStatusEmail,
  applicationSubmittedEmail,
  adminPaymentAlertEmail,
  adminApplicationAlertEmail,
};
