// Temporary script to insert a demo service into MongoDB
// Usage: node scripts/insert-demo-service.js

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const Service = require("../src/models/Service");

async function main() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const demoService = {
      title: "Outlier AI Account Setup",
      slug: "outlier-ai-setup",
      price: 25,
      category: "AI Platforms",
      shortDescription: "Manual onboarding and verification for Outlier AI",
      description:
        "We help you get verified on Outlier AI with human-assisted onboarding. No bots. Manual checks.",
      images: ["https://via.placeholder.com/600x400"],
      active: true,
    };

    const exists = await Service.findOne({ slug: demoService.slug });
    if (exists) {
      console.log("Demo service already exists.");
    } else {
      await Service.create(demoService);
      console.log("Demo service inserted successfully.");
    }
  } catch (err) {
    console.error("Error inserting demo service:", err);
  } finally {
    await mongoose.disconnect();
  }
}

main();
