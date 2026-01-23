const Service = require("./src/models/Service");

console.log("=== SERVICE MODEL VERIFICATION ===");
console.log("CATEGORY_ENUM:", Service.CATEGORY_ENUM);
console.log(
  "SUBCATEGORY_BY_CATEGORY:",
  JSON.stringify(Service.SUBCATEGORY_BY_CATEGORY, null, 2),
);
console.log("");
console.log(
  "Schema fields:",
  Object.keys(Service.schema.paths)
    .filter((p) => !p.startsWith("_"))
    .join(", "),
);

// Verify countryPricing field exists
const countryPricingPath = Service.schema.path("countryPricing");
console.log("");
console.log("countryPricing field exists:", !!countryPricingPath);
console.log("countryPricing type:", countryPricingPath?.instance);

process.exit(0);
