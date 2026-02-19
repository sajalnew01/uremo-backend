/**
 * PATCH_106 — Database Consistency Check Script
 *
 * Scans all services in production and reports corrupted entries:
 *  - buy=true  & price=0
 *  - rent=true & rentalPlans empty
 *  - apply=true & linkedJobId null
 *  - isRental=false & rent=true
 *
 * DO NOT auto-fix. Report only.
 *
 * Usage:
 *   node scripts/check-service-consistency.js
 *
 * Requires MONGODB_URI in .env or as environment variable.
 */

require("dotenv").config();
const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("ERROR: MONGODB_URI environment variable not set.");
  process.exit(1);
}

async function main() {
  console.log("=== PATCH_106: Service Consistency Check ===\n");
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected.\n");

  const Service = require("../src/models/Service");

  const allServices = await Service.find({}).lean();
  console.log(`Total services in database: ${allServices.length}\n`);

  const issues = {
    buyTruePriceZero: [],
    rentTrueRentalPlansEmpty: [],
    applyTrueLinkedJobNull: [],
    isRentalFalseRentTrue: [],
  };

  for (const s of allServices) {
    const actions = s.allowedActions || {};
    const id = s._id.toString();
    const label = `${id} — "${s.title}"`;

    // buy=true & price=0
    if (actions.buy === true && (!s.price || s.price <= 0)) {
      issues.buyTruePriceZero.push(label);
    }

    // rent=true & rentalPlans empty
    if (
      actions.rent === true &&
      (!Array.isArray(s.rentalPlans) || s.rentalPlans.length === 0)
    ) {
      issues.rentTrueRentalPlansEmpty.push(label);
    }

    // apply=true & linkedJobId null
    if (actions.apply === true && !s.linkedJobId) {
      issues.applyTrueLinkedJobNull.push(label);
    }

    // isRental=false & rent=true
    if (s.isRental !== true && actions.rent === true) {
      issues.isRentalFalseRentTrue.push(label);
    }
  }

  // Report
  console.log("─────────────────────────────────────────────");
  console.log("RESULTS:");
  console.log("─────────────────────────────────────────────\n");

  const sections = [
    { key: "buyTruePriceZero", label: "buy=true & price=0 or missing" },
    { key: "rentTrueRentalPlansEmpty", label: "rent=true & rentalPlans empty" },
    { key: "applyTrueLinkedJobNull", label: "apply=true & linkedJobId null" },
    { key: "isRentalFalseRentTrue", label: "isRental=false & rent=true" },
  ];

  let totalCorrupted = 0;

  for (const { key, label } of sections) {
    const list = issues[key];
    totalCorrupted += list.length;
    console.log(
      `[${list.length > 0 ? "FAIL" : " OK "}] ${label}: ${list.length} service(s)`,
    );
    if (list.length > 0) {
      for (const item of list) {
        console.log(`       └─ ${item}`);
      }
    }
    console.log();
  }

  console.log("─────────────────────────────────────────────");
  console.log(`Total corrupted: ${totalCorrupted} / ${allServices.length}`);
  console.log("─────────────────────────────────────────────");
  console.log("\n⚠ NO auto-fix applied. Review and fix manually.\n");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
