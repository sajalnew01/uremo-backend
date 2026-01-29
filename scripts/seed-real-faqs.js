/**
 * PATCH_41: Real Baseline FAQ Seeding
 *
 * This script seeds production-safe, evergreen FAQs.
 * Run once: node scripts/seed-real-faqs.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Faq = require("../src/models/Faq");

const REAL_FAQS = [
  {
    question: "What is a fresh profile?",
    answer:
      "A fresh profile is a newly created account that has never been used before and requires full onboarding and verification. These accounts are at the starting stage and need to complete identity verification (KYC), qualification tests, and any platform-specific requirements before they can be used for work or transactions.",
    category: "accounts",
    order: 1,
  },
  {
    question: "What is a ready-to-work account?",
    answer:
      "A ready-to-work account is one that has successfully passed all screening requirements and verification processes. These accounts are eligible to start tasks, receive project assignments, or conduct transactions immediately. They have full platform access and can begin earning right away.",
    category: "work",
    order: 2,
  },
  {
    question: "How long does verification take?",
    answer:
      "Most verification services are completed within 24 to 48 hours. The exact timeframe depends on the platform requirements, document quality, and any additional verification steps needed. Complex verifications or those requiring multiple rounds of document submission may take longer. You can track your order status through your dashboard.",
    category: "verification",
    order: 3,
  },
  {
    question: "Is manual verification safe?",
    answer:
      "Yes, manual verification is safe when done through a reputable service. At UREMO, documents are reviewed manually by trained professionals and handled securely. We use encrypted transmission for all sensitive documents, limit access to authorized personnel only, and follow strict data protection practices. Documents are used only for their stated verification purpose.",
    category: "verification",
    order: 4,
  },
  {
    question: "Can I apply to work without buying?",
    answer:
      "Yes, you can apply to work on supported job categories without making any purchase. Many services on UREMO offer both buying and work application options. If a service supports work applications, you'll see an 'Apply to Work' button on the service page. Once approved, you can complete tasks and earn money to your wallet.",
    category: "work",
    order: 5,
  },
  {
    question: "How do I get paid for completed work?",
    answer:
      "Earnings from completed work are credited to your UREMO wallet. Once your balance reaches the minimum withdrawal threshold, you can request a withdrawal to your preferred payment method. Payments are typically processed within 24-48 hours of approval. Your workspace dashboard shows your current earnings, pending amounts, and payment history.",
    category: "payments",
    order: 6,
  },
  {
    question: "What happens if my verification is rejected?",
    answer:
      "If verification is rejected, you will receive a notification explaining the reason. Common causes include expired documents, poor image quality, or information mismatches. You can resubmit with corrected documents. Our support team is available to help identify issues and guide you through successful resubmission.",
    category: "verification",
    order: 7,
  },
  {
    question: "What documents are typically required for KYC?",
    answer:
      "Most KYC verifications require a government-issued ID (passport, national ID, or driver's license) and proof of address (utility bill, bank statement, or government correspondence from the last 3 months). Some platforms also require a selfie or video verification. Specific requirements vary by platform and are listed on each service page.",
    category: "verification",
    order: 8,
  },
  {
    question: "How do I track my order status?",
    answer:
      "You can track all your orders through your UREMO dashboard. Go to the Orders page to see your active orders, their current status, and any messages from our team. You'll also receive email notifications for important status updates. Each order shows its progress from placement through completion.",
    category: "general",
    order: 9,
  },
  {
    question: "What is the refund policy?",
    answer:
      "If a service cannot be completed due to platform issues outside your control, you may be eligible for a refund or credit. Refund eligibility depends on the specific circumstances and service type. Contact our support team with your order details for assistance. We aim to resolve all issues fairly and promptly.",
    category: "payments",
    order: 10,
  },
];

async function seedFaqs() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI or MONGO_URI not set in environment");
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    console.log("\nSeeding real FAQs...\n");

    let created = 0;
    let skipped = 0;

    for (const faqData of REAL_FAQS) {
      // Check if FAQ already exists by question
      const existing = await Faq.findOne({ question: faqData.question });
      if (existing) {
        console.log(
          `⏭️  Skipped (exists): ${faqData.question.substring(0, 40)}...`,
        );
        skipped++;
        continue;
      }

      await Faq.create(faqData);
      console.log(`✅ Created: ${faqData.question.substring(0, 40)}...`);
      created++;
    }

    console.log("\n========================================");
    console.log(`FAQs created: ${created}`);
    console.log(`FAQs skipped: ${skipped}`);
    console.log(`Total FAQs in DB: ${await Faq.countDocuments()}`);
    console.log("========================================\n");

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding FAQs:", error);
    process.exit(1);
  }
}

seedFaqs();
