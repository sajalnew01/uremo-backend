/**
 * PATCH_82: PayPal Configuration
 * Server-side PayPal REST SDK initialization
 *
 * Environment Variables Required:
 * - PAYPAL_CLIENT_ID: Your PayPal app client ID
 * - PAYPAL_CLIENT_SECRET: Your PayPal app secret
 * - PAYPAL_MODE: 'sandbox' or 'live' (defaults to sandbox)
 */

const paypal = require("@paypal/checkout-server-sdk");

let environment = null;
let client = null;

// Only initialize if credentials are configured
if (
  process.env.PAYPAL_CLIENT_ID &&
  process.env.PAYPAL_CLIENT_SECRET &&
  process.env.PAYPAL_CLIENT_ID.trim() !== "" &&
  process.env.PAYPAL_CLIENT_SECRET.trim() !== ""
) {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const mode = process.env.PAYPAL_MODE || "sandbox";

  // Create environment based on mode
  if (mode === "live") {
    environment = new paypal.core.LiveEnvironment(clientId, clientSecret);
  } else {
    environment = new paypal.core.SandboxEnvironment(clientId, clientSecret);
  }

  client = new paypal.core.PayPalHttpClient(environment);
  console.log(`✅ PayPal initialized in ${mode.toUpperCase()} mode`);
} else {
  console.log(
    "⚠️  PayPal not configured - missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET",
  );
}

module.exports = {
  client,
  paypal,
  isConfigured: () => client !== null,
};
