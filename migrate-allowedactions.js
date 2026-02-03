/**
 * PATCH_62: Migration Script - Sync AllowedActions
 *
 * This script re-saves all services to trigger the pre-save hook
 * which computes and stores the correct allowedActions based on category.
 *
 * Run this after deploying the PATCH_38 category actions system.
 */

const mongoose = require("mongoose");
require("dotenv").config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

// Import the categoryActions helpers
const {
  getAllowedActionsForService,
  getEffectiveCategoryFromService,
} = require("./src/config/categoryActions");

async function migrate() {
  console.log("=".repeat(60));
  console.log("PATCH_62: AllowedActions Migration Script");
  console.log("=".repeat(60));

  if (!MONGO_URI) {
    console.error("ERROR: MONGODB_URI not set in environment");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("Connected successfully\n");

  // Get the Service collection directly (bypass model to see raw data)
  const db = mongoose.connection.db;
  const collection = db.collection("services");

  // Find all services
  const services = await collection.find({}).toArray();
  console.log(`Found ${services.length} services to process\n`);

  let updated = 0;
  let errors = 0;
  const results = [];

  for (const service of services) {
    try {
      const effectiveCategory = getEffectiveCategoryFromService(service);
      const computedActions = getAllowedActionsForService(service);
      const currentActions = service.allowedActions || {};

      // Check if update is needed
      const needsUpdate =
        currentActions.buy !== computedActions.buy ||
        currentActions.apply !== computedActions.apply ||
        currentActions.rent !== computedActions.rent ||
        currentActions.deal !== computedActions.deal;

      if (needsUpdate) {
        // Direct update to avoid any middleware issues
        await collection.updateOne(
          { _id: service._id },
          {
            $set: {
              allowedActions: computedActions,
              updatedAt: new Date(),
            },
          },
        );

        results.push({
          title: service.title,
          category: service.category,
          effectiveCategory,
          before: currentActions,
          after: computedActions,
          status: "UPDATED",
        });
        updated++;
      } else {
        results.push({
          title: service.title,
          category: service.category,
          status: "NO_CHANGE",
        });
      }
    } catch (err) {
      console.error(`Error processing service ${service._id}: ${err.message}`);
      errors++;
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("MIGRATION RESULTS");
  console.log("=".repeat(60));

  console.log("\nUpdated services:");
  results
    .filter((r) => r.status === "UPDATED")
    .forEach((r) => {
      console.log(`  ✓ ${r.title}`);
      console.log(
        `    Category: ${r.category} → Effective: ${r.effectiveCategory}`,
      );
      console.log(
        `    Before: buy=${r.before.buy}, apply=${r.before.apply}, rent=${r.before.rent}, deal=${r.before.deal}`,
      );
      console.log(
        `    After:  buy=${r.after.buy}, apply=${r.after.apply}, rent=${r.after.rent}, deal=${r.after.deal}`,
      );
    });

  console.log(`\nSummary:`);
  console.log(`  Total services: ${services.length}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  No change needed: ${services.length - updated - errors}`);
  console.log(`  Errors: ${errors}`);

  // Verify the fix
  console.log("\n" + "=".repeat(60));
  console.log("VERIFICATION - Intent Counts");
  console.log("=".repeat(60));

  const counts = await Promise.all([
    collection.countDocuments({
      status: "active",
      active: true,
      "allowedActions.buy": true,
    }),
    collection.countDocuments({
      status: "active",
      active: true,
      "allowedActions.apply": true,
    }),
    collection.countDocuments({
      status: "active",
      active: true,
      "allowedActions.rent": true,
    }),
    collection.countDocuments({
      status: "active",
      active: true,
      "allowedActions.deal": true,
    }),
  ]);

  console.log(`  Buy services:   ${counts[0]}`);
  console.log(`  Apply services: ${counts[1]}`);
  console.log(`  Rent services:  ${counts[2]}`);
  console.log(`  Deal services:  ${counts[3]}`);

  await mongoose.disconnect();
  console.log("\nMigration complete!");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
