/**
 * Health Report Contract Sanity Test
 *
 * Validates that /api/jarvisx/health-report returns a stable JSON shape
 * with all required keys present (never undefined).
 *
 * Usage:
 *   node scripts/test-health-contract.js [BASE_URL]
 *
 * Examples:
 *   node scripts/test-health-contract.js                          # Uses localhost:5000
 *   node scripts/test-health-contract.js http://localhost:5000    # Explicit local
 *   node scripts/test-health-contract.js https://api.uremo.online # Production
 */

const BASE_URL = process.argv[2] || "http://localhost:5000";
const ENDPOINT = "/api/jarvisx/health-report";

// Required keys that must ALWAYS exist in response (can be 0, but not undefined)
const REQUIRED_SHAPE = {
  ok: "boolean",
  generatedAt: "string",
  serverTime: "string",
  llm: {
    configured: "boolean",
    provider: "string",
    model: "string",
  },
  services: {
    total: "number",
    active: "number",
    missingHeroCount: "number",
  },
  workPositions: {
    total: "number",
    active: "number",
  },
  serviceRequests: {
    total: "number",
    new: "number",
    draft: "number",
  },
  orders: {
    paymentProofPendingCount: "number",
  },
  settings: {
    missingKeys: "array",
  },
  jarvisx: {
    chatTotal24h: "number",
    chatOk24h: "number",
    chatErrorRate24h: "number",
  },
};

function validateShape(obj, shape, path = "") {
  const errors = [];

  for (const key of Object.keys(shape)) {
    const fullPath = path ? `${path}.${key}` : key;
    const expectedType = shape[key];
    const actualValue = obj?.[key];

    if (actualValue === undefined) {
      errors.push(`MISSING: ${fullPath} is undefined`);
      continue;
    }

    if (typeof expectedType === "object" && !Array.isArray(expectedType)) {
      // Nested object - recurse
      if (typeof actualValue !== "object" || actualValue === null) {
        errors.push(
          `TYPE_ERROR: ${fullPath} should be object, got ${typeof actualValue}`
        );
      } else {
        errors.push(...validateShape(actualValue, expectedType, fullPath));
      }
    } else if (expectedType === "array") {
      if (!Array.isArray(actualValue)) {
        errors.push(
          `TYPE_ERROR: ${fullPath} should be array, got ${typeof actualValue}`
        );
      }
    } else {
      // Primitive type check
      if (typeof actualValue !== expectedType) {
        errors.push(
          `TYPE_ERROR: ${fullPath} should be ${expectedType}, got ${typeof actualValue}`
        );
      }
    }
  }

  return errors;
}

async function runTest() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║       JARVISX HEALTH REPORT CONTRACT TEST                  ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`\nTarget: ${BASE_URL}${ENDPOINT}\n`);

  try {
    const startTime = Date.now();
    const response = await fetch(`${BASE_URL}${ENDPOINT}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    const elapsed = Date.now() - startTime;

    console.log(`HTTP Status: ${response.status}`);
    console.log(`Response Time: ${elapsed}ms\n`);

    if (!response.ok && response.status !== 200) {
      console.log("❌ FAIL: Non-200 status code");
      console.log(
        "   Health endpoint should ALWAYS return 200, even on internal error."
      );
      process.exit(1);
    }

    const data = await response.json();

    console.log("Response Preview:");
    console.log("─".repeat(50));
    console.log(JSON.stringify(data, null, 2).slice(0, 800));
    if (JSON.stringify(data).length > 800) console.log("... (truncated)");
    console.log("─".repeat(50));
    console.log();

    // Validate shape
    const errors = validateShape(data, REQUIRED_SHAPE);

    if (errors.length === 0) {
      console.log(
        "✅ CONTRACT VALID: All required keys present with correct types\n"
      );
      console.log("Shape validation:");
      console.log("  ✓ ok: boolean");
      console.log("  ✓ generatedAt: string");
      console.log("  ✓ serverTime: string");
      console.log("  ✓ llm.configured: boolean");
      console.log("  ✓ llm.provider: string");
      console.log("  ✓ llm.model: string");
      console.log("  ✓ services.total: number");
      console.log("  ✓ services.active: number");
      console.log("  ✓ services.missingHeroCount: number");
      console.log("  ✓ workPositions.total: number");
      console.log("  ✓ workPositions.active: number");
      console.log("  ✓ serviceRequests.total: number");
      console.log("  ✓ serviceRequests.new: number");
      console.log("  ✓ serviceRequests.draft: number");
      console.log("  ✓ orders.paymentProofPendingCount: number");
      console.log("  ✓ settings.missingKeys: array");
      console.log("  ✓ jarvisx.chatTotal24h: number");
      console.log("  ✓ jarvisx.chatOk24h: number");
      console.log("  ✓ jarvisx.chatErrorRate24h: number");
      console.log();
      console.log("═".repeat(50));
      console.log("TEST PASSED ✅");
      console.log("═".repeat(50));
      process.exit(0);
    } else {
      console.log("❌ CONTRACT VIOLATIONS:");
      for (const err of errors) {
        console.log(`   • ${err}`);
      }
      console.log();
      console.log("═".repeat(50));
      console.log("TEST FAILED ❌");
      console.log("═".repeat(50));
      process.exit(1);
    }
  } catch (err) {
    console.log(`❌ NETWORK ERROR: ${err.message}`);
    console.log("\nMake sure the backend server is running.");
    console.log(`Tried to connect to: ${BASE_URL}${ENDPOINT}`);
    process.exit(1);
  }
}

runTest();
