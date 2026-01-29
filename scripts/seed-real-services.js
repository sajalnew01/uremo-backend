/**
 * PATCH_41: Real Baseline Service Seeding
 *
 * This script seeds production-safe, evergreen services.
 * Run once: node scripts/seed-real-services.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Service = require("../src/models/Service");

// Helper to generate slug from title
const slugify = (title) => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
};

const REAL_SERVICES = [
  // MICROJOBS / ONLINE GIGS
  {
    title: "Populi Microjob KYC & Onboarding Assistance",
    slug: "populi-microjob-kyc-onboarding-assistance",
    category: "microjobs",
    subcategory: "fresh_account",
    description:
      "Get professional assistance with your Populi microjob account setup and KYC verification. Our team handles the entire onboarding process, ensuring your profile meets all platform requirements for task eligibility.",
    shortDescription:
      "Complete Populi account setup with KYC verification assistance.",
    price: 25,
    deliveryType: "manual",
    features: [
      "Manual verification by UREMO team",
      "Secure document handling",
      "24–48 hour fulfillment on most cases",
      "Human support included",
      "Dashboard tracking access",
    ],
    requirements:
      "Valid government-issued ID\nProof of address\nSelfie for verification\nStable internet connection",
    countries: ["Global"],
    active: true,
    allowedActions: { buy: true, apply: true, rent: false, deal: false },
  },
  {
    title: "Outlier AI Project Access – Dentistry Queue Support",
    slug: "outlier-ai-dentistry-queue-support",
    category: "microjobs",
    subcategory: "fresh_account",
    description:
      "Access the Outlier AI dentistry project queue with our verification support. We assist with profile optimization and queue placement to help you start earning on specialized AI training tasks.",
    shortDescription: "Get verified for Outlier AI dentistry project tasks.",
    price: 35,
    deliveryType: "manual",
    features: [
      "Manual verification by UREMO team",
      "Secure document handling",
      "24–48 hour fulfillment on most cases",
      "Human support included",
      "Dashboard tracking access",
    ],
    requirements:
      "Professional background in dentistry or healthcare preferred\nValid ID\nEmail address",
    countries: ["Global"],
    active: true,
    allowedActions: { buy: true, apply: true, rent: false, deal: false },
  },
  {
    title: "Handshake AI USA Profile Onboarding Support",
    slug: "handshake-ai-usa-profile-onboarding-support",
    category: "microjobs",
    subcategory: "fresh_account",
    description:
      "Complete onboarding assistance for Handshake AI USA profiles. Our team guides you through the verification process and ensures your account is fully activated for AI training opportunities.",
    shortDescription: "Handshake AI USA account setup and verification.",
    price: 30,
    deliveryType: "manual",
    features: [
      "Manual verification by UREMO team",
      "Secure document handling",
      "24–48 hour fulfillment on most cases",
      "Human support included",
      "Dashboard tracking access",
    ],
    requirements:
      "USA-based documentation\nValid SSN or ITIN\nBank account for payments",
    countries: ["United States"],
    active: true,
    allowedActions: { buy: true, apply: false, rent: false, deal: false },
  },
  {
    title: "WriterBay Profile Setup & Verification",
    slug: "writerbay-profile-setup-verification",
    category: "microjobs",
    subcategory: "fresh_account",
    description:
      "Professional setup and verification for your WriterBay freelance writing profile. We help you pass the application process and set up your account for receiving writing assignments.",
    shortDescription: "WriterBay freelance writer account setup assistance.",
    price: 20,
    deliveryType: "manual",
    features: [
      "Manual verification by UREMO team",
      "Secure document handling",
      "24–48 hour fulfillment on most cases",
      "Human support included",
      "Dashboard tracking access",
    ],
    requirements:
      "Writing samples (2-3 pieces)\nValid email\nPayment method for receiving funds",
    countries: ["Global"],
    active: true,
    allowedActions: { buy: true, apply: true, rent: false, deal: false },
  },
  {
    title: "Remotasks Account Verification Assistance",
    slug: "remotasks-account-verification-assistance",
    category: "microjobs",
    subcategory: "fresh_account",
    description:
      "Get your Remotasks account verified and ready for AI training tasks. Our team assists with the bootcamp completion and ensures your profile is optimized for task availability.",
    shortDescription: "Remotasks account verification and bootcamp support.",
    price: 15,
    deliveryType: "manual",
    features: [
      "Manual verification by UREMO team",
      "Secure document handling",
      "24–48 hour fulfillment on most cases",
      "Human support included",
      "Dashboard tracking access",
    ],
    requirements:
      "Valid email address\nBasic English proficiency\nComputer with stable internet",
    countries: ["Global"],
    active: true,
    allowedActions: { buy: true, apply: true, rent: false, deal: false },
  },

  // FOREX & CRYPTO
  {
    title: "HFM Global KYC Verification (Forex Trading Account)",
    slug: "hfm-global-kyc-verification-forex",
    category: "forex_crypto",
    subcategory: "forex_platform_creation",
    description:
      "Complete KYC verification assistance for your HFM Global forex trading account. We guide you through document submission and ensure your trading account is fully verified and ready for deposits.",
    shortDescription: "HFM Global forex account KYC verification support.",
    price: 40,
    deliveryType: "manual",
    features: [
      "Manual verification by UREMO team",
      "Secure document handling",
      "24–48 hour fulfillment on most cases",
      "Human support included",
      "Dashboard tracking access",
    ],
    requirements:
      "Valid passport or national ID\nProof of address (utility bill or bank statement)\nSelfie with ID",
    countries: ["Global"],
    active: true,
    allowedActions: { buy: true, apply: false, rent: false, deal: true },
  },
  {
    title: "Binance Account KYC Assistance",
    slug: "binance-account-kyc-assistance",
    category: "forex_crypto",
    subcategory: "crypto_platform_creation",
    description:
      "Professional assistance with Binance account KYC verification. We help ensure your documents meet platform requirements and guide you through the verification tiers for increased trading limits.",
    shortDescription: "Binance cryptocurrency exchange KYC verification help.",
    price: 35,
    deliveryType: "manual",
    features: [
      "Manual verification by UREMO team",
      "Secure document handling",
      "24–48 hour fulfillment on most cases",
      "Human support included",
      "Dashboard tracking access",
    ],
    requirements:
      "Government-issued ID\nProof of address\nFacial verification capability",
    countries: ["Global"],
    active: true,
    allowedActions: { buy: true, apply: false, rent: false, deal: true },
  },
  {
    title: "Bybit Account KYC Assistance",
    slug: "bybit-account-kyc-assistance",
    category: "forex_crypto",
    subcategory: "crypto_platform_creation",
    description:
      "Get your Bybit account fully verified with our KYC assistance service. We ensure proper document submission and guide you through each verification step for full platform access.",
    shortDescription: "Bybit exchange account KYC verification support.",
    price: 35,
    deliveryType: "manual",
    features: [
      "Manual verification by UREMO team",
      "Secure document handling",
      "24–48 hour fulfillment on most cases",
      "Human support included",
      "Dashboard tracking access",
    ],
    requirements:
      "Valid ID document\nProof of residence\nDevice with camera for verification",
    countries: ["Global"],
    active: true,
    allowedActions: { buy: true, apply: false, rent: false, deal: true },
  },
  {
    title: "OKX Account Verification Support",
    slug: "okx-account-verification-support",
    category: "forex_crypto",
    subcategory: "crypto_platform_creation",
    description:
      "Complete verification support for your OKX cryptocurrency exchange account. Our team assists with KYC documentation and ensures your account is ready for trading and withdrawals.",
    shortDescription: "OKX crypto exchange account verification assistance.",
    price: 35,
    deliveryType: "manual",
    features: [
      "Manual verification by UREMO team",
      "Secure document handling",
      "24–48 hour fulfillment on most cases",
      "Human support included",
      "Dashboard tracking access",
    ],
    requirements:
      "Government ID\nAddress verification document\nEmail and phone number",
    countries: ["Global"],
    active: true,
    allowedActions: { buy: true, apply: false, rent: false, deal: true },
  },

  // BANKS / GATEWAYS / WALLETS
  {
    title: "Airtm Account Setup & Verification",
    slug: "airtm-account-setup-verification",
    category: "banks_gateways_wallets",
    subcategory: "wallets",
    description:
      "Professional setup and verification for your Airtm digital wallet. We assist with account creation, KYC verification, and ensure your wallet is ready for receiving and sending funds globally.",
    shortDescription: "Airtm digital wallet account setup and verification.",
    price: 25,
    deliveryType: "manual",
    features: [
      "Manual verification by UREMO team",
      "Secure document handling",
      "24–48 hour fulfillment on most cases",
      "Human support included",
      "Dashboard tracking access",
    ],
    requirements: "Valid ID\nProof of address\nEmail address\nPhone number",
    countries: ["Global"],
    active: true,
    allowedActions: { buy: true, apply: false, rent: true, deal: false },
  },
  {
    title: "Wise Account Setup & Verification",
    slug: "wise-account-setup-verification",
    category: "banks_gateways_wallets",
    subcategory: "payment_gateways",
    description:
      "Complete Wise (formerly TransferWise) account setup with full verification. We guide you through the process to unlock multi-currency accounts and international money transfers at low fees.",
    shortDescription: "Wise multi-currency account setup and verification.",
    price: 30,
    deliveryType: "manual",
    features: [
      "Manual verification by UREMO team",
      "Secure document handling",
      "24–48 hour fulfillment on most cases",
      "Human support included",
      "Dashboard tracking access",
    ],
    requirements:
      "Government-issued ID\nProof of address (recent utility bill or bank statement)\nSource of funds documentation",
    countries: ["Global"],
    active: true,
    allowedActions: { buy: true, apply: false, rent: true, deal: false },
  },
  {
    title: "Skrill Account Verification Support",
    slug: "skrill-account-verification-support",
    category: "banks_gateways_wallets",
    subcategory: "wallets",
    description:
      "Get your Skrill account fully verified for unlimited transactions. Our team assists with document submission and guides you through the verification process for enhanced account limits.",
    shortDescription: "Skrill e-wallet account verification assistance.",
    price: 25,
    deliveryType: "manual",
    features: [
      "Manual verification by UREMO team",
      "Secure document handling",
      "24–48 hour fulfillment on most cases",
      "Human support included",
      "Dashboard tracking access",
    ],
    requirements:
      "Valid ID or passport\nProof of address\nBank card for verification",
    countries: ["Global"],
    active: true,
    allowedActions: { buy: true, apply: false, rent: true, deal: false },
  },
  {
    title: "Neteller Account Verification Support",
    slug: "neteller-account-verification-support",
    category: "banks_gateways_wallets",
    subcategory: "wallets",
    description:
      "Professional verification support for your Neteller e-wallet account. We ensure your documents are properly submitted and your account is upgraded for higher transaction limits.",
    shortDescription: "Neteller e-wallet verification and upgrade support.",
    price: 25,
    deliveryType: "manual",
    features: [
      "Manual verification by UREMO team",
      "Secure document handling",
      "24–48 hour fulfillment on most cases",
      "Human support included",
      "Dashboard tracking access",
    ],
    requirements:
      "Government ID\nProof of address\nEmail and phone verification",
    countries: ["Global"],
    active: true,
    allowedActions: { buy: true, apply: false, rent: true, deal: false },
  },
];

async function seedServices() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI or MONGO_URI not set in environment");
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    console.log("\nSeeding real services...\n");

    let created = 0;
    let skipped = 0;

    for (const serviceData of REAL_SERVICES) {
      // Check if service already exists by slug
      const existing = await Service.findOne({ slug: serviceData.slug });
      if (existing) {
        console.log(`⏭️  Skipped (exists): ${serviceData.title}`);
        skipped++;
        continue;
      }

      await Service.create(serviceData);
      console.log(`✅ Created: ${serviceData.title}`);
      created++;
    }

    console.log("\n========================================");
    console.log(`Services created: ${created}`);
    console.log(`Services skipped: ${skipped}`);
    console.log(`Total services in DB: ${await Service.countDocuments()}`);
    console.log("========================================\n");

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding services:", error);
    process.exit(1);
  }
}

seedServices();
