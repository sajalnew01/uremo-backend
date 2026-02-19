/**
 * PATCH_107 — Production Legacy Service Data Repair
 *
 * Repairs corrupted Service documents in production database:
 *  - buy=true & price≤0 → set buy=false
 *  - rent=true & (isRental!==true OR rentalPlans empty) → set rent=false, isRental=false
 *  - apply=true & linkedJobId==null → set apply=false
 *  - deal=true & price≤0 → set deal=false
 *
 * Saves document ONLY if modified.
 * Logs all affected service IDs.
 *
 * Usage:
 *   MONGO_URI=<prod_uri> node scripts/repair-legacy-services.js
 *
 * Can also use .env file with MONGO_URI set.
 */

require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error(
    "ERROR: MONGO_URI or MONGODB_URI environment variable not set.",
  );
  process.exit(1);
}

async function main() {
  console.log(
    "╔══════════════════════════════════════════════════════════════╗",
  );
  console.log("║    PATCH_107 — PRODUCTION LEGACY SERVICE DATA REPAIR       ║");
  console.log(
    "╚══════════════════════════════════════════════════════════════╝\n",
  );

  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log(`Connected to: ${mongoose.connection.name}\n`);

  const Service = require("../src/models/Service");

  const allServices = await Service.find({});
  console.log(`Total services in database: ${allServices.length}\n`);

  const stats = {
    totalServices: allServices.length,
    repairedBuy: 0,
    repairedRent: 0,
    repairedApply: 0,
    repairedDeal: 0,
    totalModified: 0,
  };

  const repairLog = {
    buy: [],
    rent: [],
    apply: [],
    deal: [],
  };

  for (const service of allServices) {
    let modified = false;
    const id = service._id.toString();
    const title = service.title || "(untitled)";

    // Ensure allowedActions exists
    if (!service.allowedActions) {
      service.allowedActions = {
        buy: false,
        apply: false,
        rent: false,
        deal: false,
      };
      modified = true;
    }

    // Rule 1: buy=true & price≤0 → set buy=false
    if (
      service.allowedActions.buy === true &&
      (!service.price || service.price <= 0)
    ) {
      console.log(`  [BUY FIX] ${id} — "${title}" (price=${service.price})`);
      service.allowedActions.buy = false;
      stats.repairedBuy++;
      repairLog.buy.push({ id, title, price: service.price });
      modified = true;
    }

    // Rule 2: rent=true & (isRental!==true OR rentalPlans empty) → set rent=false, isRental=false
    if (service.allowedActions.rent === true) {
      const hasValidRental =
        service.isRental === true &&
        Array.isArray(service.rentalPlans) &&
        service.rentalPlans.length > 0;

      if (!hasValidRental) {
        console.log(
          `  [RENT FIX] ${id} — "${title}" (isRental=${service.isRental}, rentalPlans=${(service.rentalPlans || []).length})`,
        );
        service.allowedActions.rent = false;
        service.isRental = false;
        stats.repairedRent++;
        repairLog.rent.push({
          id,
          title,
          isRental: service.isRental,
          rentalPlansCount: (service.rentalPlans || []).length,
        });
        modified = true;
      }
    }

    // Rule 3: apply=true & linkedJobId==null → set apply=false
    if (service.allowedActions.apply === true && !service.linkedJobId) {
      console.log(
        `  [APPLY FIX] ${id} — "${title}" (linkedJobId=${service.linkedJobId})`,
      );
      service.allowedActions.apply = false;
      stats.repairedApply++;
      repairLog.apply.push({ id, title });
      modified = true;
    }

    // Rule 4: deal=true & price≤0 → set deal=false
    if (
      service.allowedActions.deal === true &&
      (!service.price || service.price <= 0)
    ) {
      console.log(`  [DEAL FIX] ${id} — "${title}" (price=${service.price})`);
      service.allowedActions.deal = false;
      stats.repairedDeal++;
      repairLog.deal.push({ id, title, price: service.price });
      modified = true;
    }

    // Save only if modified
    if (modified) {
      await service.save({ validateBeforeSave: false });
      stats.totalModified++;
    }
  }

  // Final Report
  console.log(
    "\n╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║                    REPAIR REPORT                            ║",
  );
  console.log(
    "╠══════════════════════════════════════════════════════════════╣",
  );
  console.log(
    `║  Total Services:     ${stats.totalServices.toString().padEnd(39)}║`,
  );
  console.log(
    `║  Repaired Buy:       ${stats.repairedBuy.toString().padEnd(39)}║`,
  );
  console.log(
    `║  Repaired Rent:      ${stats.repairedRent.toString().padEnd(39)}║`,
  );
  console.log(
    `║  Repaired Apply:     ${stats.repairedApply.toString().padEnd(39)}║`,
  );
  console.log(
    `║  Repaired Deal:      ${stats.repairedDeal.toString().padEnd(39)}║`,
  );
  console.log(
    `║  Total Modified:     ${stats.totalModified.toString().padEnd(39)}║`,
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝",
  );

  // Write detailed log
  const fs = require("fs");
  const logOutput = {
    timestamp: new Date().toISOString(),
    stats,
    repairLog,
  };
  const logPath = require("path").join(
    __dirname,
    "repair-legacy-services-log.json",
  );
  fs.writeFileSync(logPath, JSON.stringify(logOutput, null, 2));
  console.log(`\nDetailed log written to: ${logPath}`);

  await mongoose.disconnect();
  console.log("Disconnected from MongoDB.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("REPAIR SCRIPT FAILED:", err);
  process.exit(1);
});
