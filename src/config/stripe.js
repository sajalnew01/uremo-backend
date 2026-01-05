let stripe = null;

if (
  process.env.STRIPE_SECRET_KEY &&
  process.env.STRIPE_SECRET_KEY.trim() !== ""
) {
  const Stripe = require("stripe");
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
}

module.exports = stripe;
