/**
 * PATCH_32: Seed Demo Data Script
 *
 * Seeds the database with demo data for testing:
 * - 3 blog posts
 * - 2 active regular services
 * - 1 rental service
 * - 3 system notifications
 *
 * Usage: node scripts/seed-demo.js
 * Requires: MONGODB_URI environment variable
 */

require("dotenv").config();
const mongoose = require("mongoose");

// Models
const Blog = require("../src/models/Blog");
const Service = require("../src/models/Service");
const Notification = require("../src/models/Notification");
const User = require("../src/models/User");

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("Error: MONGODB_URI environment variable is required");
  process.exit(1);
}

const demoBlogs = [
  {
    title: "Getting Started with Outlier Platform",
    slug: "getting-started-outlier-platform",
    excerpt:
      "A comprehensive guide to joining and succeeding on the Outlier AI platform.",
    content: `# Getting Started with Outlier Platform

Outlier is one of the leading AI training platforms where you can earn by contributing to AI model training.

## Requirements

1. Strong writing skills
2. Attention to detail
3. Ability to follow instructions
4. At least 10 hours per week availability

## How to Apply

1. Visit the Outlier website
2. Complete the application form
3. Pass the screening assessment
4. Start earning!

## Tips for Success

- Read all instructions carefully
- Take your time with assessments
- Maintain high quality standards
- Be consistent with your work schedule

Need help? Our team at UREMO can assist you with the application process and assessment preparation.`,
    category: "guides",
    status: "published",
    tags: ["outlier", "ai-training", "remote-work"],
  },
  {
    title: "Top 5 Microjob Platforms in 2026",
    slug: "top-5-microjob-platforms-2026",
    excerpt:
      "Discover the best microjob platforms to earn money online this year.",
    content: `# Top 5 Microjob Platforms in 2026

The gig economy continues to grow, offering more opportunities than ever.

## 1. Outlier AI

- AI training tasks
- $15-25/hour potential
- Flexible schedule

## 2. Scale AI

- Data labeling
- Computer vision tasks
- Growing demand

## 3. WriterBay

- Academic writing
- Research tasks
- Stable income

## 4. Appen

- Data collection
- Translation
- Various projects

## 5. Fiverr

- Freelance services
- Build your brand
- Set your rates

## Conclusion

Each platform has unique opportunities. UREMO helps you get started on any of these platforms quickly.`,
    category: "microjobs",
    status: "published",
    tags: ["microjobs", "platforms", "remote-work", "gig-economy"],
  },
  {
    title: "Crypto Account Verification Guide",
    slug: "crypto-account-verification-guide",
    excerpt:
      "Step-by-step guide to verifying your cryptocurrency exchange accounts.",
    content: `# Crypto Account Verification Guide

Properly verified crypto accounts are essential for trading without limits.

## Why Verification Matters

1. Higher withdrawal limits
2. Access to all features
3. Regulatory compliance
4. Account security

## Common Requirements

- Government-issued ID
- Proof of address
- Selfie verification
- Phone verification

## Platform-Specific Tips

### Binance

- Use high-quality photos
- Ensure documents are not expired
- Match name exactly

### Coinbase

- US residents preferred
- SSN verification
- Bank account linking

## Need Help?

UREMO offers verified account services and verification assistance for major platforms.`,
    category: "forex_crypto",
    status: "published",
    tags: ["crypto", "verification", "binance", "coinbase"],
  },
];

const demoServices = [
  {
    title: "Outlier Fresh Account Creation",
    slug: "outlier-fresh-account-creation",
    category: "microjobs",
    subcategory: "fresh_account",
    description:
      "Get a fresh Outlier account ready for application. Includes email setup, profile creation, and initial configuration. Perfect for those starting their AI training journey.",
    shortDescription: "Fresh Outlier account ready for application",
    price: 25,
    currency: "USD",
    deliveryType: "manual",
    platform: "Outlier",
    countries: ["Global", "USA", "India", "UK"],
    status: "active",
    active: true,
    tags: ["outlier", "fresh-account", "ai-training"],
    features: [
      "Email account included",
      "Profile fully configured",
      "Application guidance",
      "24-hour delivery",
    ],
  },
  {
    title: "Binance Verified Account",
    slug: "binance-verified-account",
    category: "forex_crypto",
    subcategory: "crypto_platform_creation",
    description:
      "Fully verified Binance account with KYC Level 2 completion. Includes higher withdrawal limits and access to all trading features. Secure and ready to use.",
    shortDescription: "KYC Level 2 verified Binance account",
    price: 150,
    currency: "USD",
    deliveryType: "manual",
    platform: "Binance",
    countries: ["USA", "UAE", "UK"],
    countryPricing: {
      USA: 180,
      UAE: 150,
      UK: 160,
    },
    status: "active",
    active: true,
    tags: ["binance", "crypto", "verified", "kyc"],
    features: [
      "KYC Level 2 verified",
      "Higher withdrawal limits",
      "All features unlocked",
      "48-hour delivery",
    ],
  },
  {
    title: "LinkedIn Premium Account Rental",
    slug: "linkedin-premium-account-rental",
    category: "rentals",
    subcategory: "linkedin_premium_account",
    description:
      "Rent a LinkedIn Premium account for job searching, networking, and business development. Includes InMail credits and premium insights.",
    shortDescription: "LinkedIn Premium for professionals",
    price: 15,
    currency: "USD",
    deliveryType: "instant",
    platform: "LinkedIn",
    countries: ["Global"],
    status: "active",
    active: true,
    isRental: true,
    rentalPlans: [
      { duration: 7, unit: "days", price: 15, label: "1 Week" },
      { duration: 30, unit: "days", price: 45, label: "1 Month" },
      { duration: 90, unit: "days", price: 120, label: "3 Months" },
    ],
    tags: ["linkedin", "premium", "rental"],
    features: [
      "InMail credits included",
      "Premium insights",
      "Job seeker features",
      "Instant access",
    ],
  },
];

async function seed() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("Connected successfully!\n");

    // Seed Blogs
    console.log("Seeding blogs...");
    for (const blogData of demoBlogs) {
      const existing = await Blog.findOne({ slug: blogData.slug });
      if (existing) {
        console.log(`  - Blog "${blogData.title}" already exists, skipping`);
      } else {
        await Blog.create(blogData);
        console.log(`  + Created blog: "${blogData.title}"`);
      }
    }

    // Seed Services
    console.log("\nSeeding services...");
    for (const serviceData of demoServices) {
      const existing = await Service.findOne({ slug: serviceData.slug });
      if (existing) {
        console.log(
          `  - Service "${serviceData.title}" already exists, skipping`,
        );
      } else {
        await Service.create(serviceData);
        console.log(`  + Created service: "${serviceData.title}"`);
      }
    }

    // Seed System Notifications for all existing users
    console.log("\nSeeding notifications...");
    const allUsers = await User.find({}).select("_id").lean();

    if (allUsers.length === 0) {
      console.log(
        "  - No users found in database. Skipping notifications (create a user first).",
      );
    } else {
      const systemNotifications = [
        {
          title: "Welcome to UREMO!",
          message:
            "Thank you for joining UREMO. Explore our services and start your journey today.",
          type: "system",
        },
        {
          title: "New Services Available",
          message:
            "Check out our latest services including Outlier account creation and LinkedIn Premium rentals.",
          type: "system",
        },
        {
          title: "24/7 Support Available",
          message:
            "Our support team is available around the clock. Create a ticket if you need assistance.",
          type: "system",
        },
      ];

      for (const user of allUsers) {
        for (const notifData of systemNotifications) {
          // Check if similar notification exists for this user
          const existing = await Notification.findOne({
            user: user._id,
            title: notifData.title,
          });
          if (!existing) {
            await Notification.create({
              ...notifData,
              user: user._id,
            });
          }
        }
        console.log(`  + Created notifications for user: ${user._id}`);
      }
    }

    console.log("\n✅ Seed completed successfully!");
  } catch (err) {
    console.error("\n❌ Seed failed:", err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

seed();
