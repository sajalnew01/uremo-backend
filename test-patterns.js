// Quick test for wallet patterns
const patterns = [
  /(?:show|get|check|see|view)\s*(?:my\s*)?(?:wallet|balance)/i,
  /(?:my|current)\s*(?:wallet|balance)/i,
  /(?:wallet|account)\s*(?:balance|status|info)/i,
  /(?:how\s*much)\s*(?:money|balance|funds?)\s*(?:do\s*i\s*have|in\s*my)/i,
  /(?:affiliate|referral)\s*(?:balance|earnings|money)/i,
  /(?:transaction|spending)\s*history/i,
];

const testMessages = [
  "what is my wallet balance",
  "show my wallet",
  "check balance",
  "my wallet",
  "wallet balance",
];

console.log("=== Wallet Pattern Testing ===\n");

for (const msg of testMessages) {
  console.log(`Message: "${msg}"`);
  let matched = false;
  for (let i = 0; i < patterns.length; i++) {
    if (patterns[i].test(msg)) {
      console.log(`  ✓ Matched pattern ${i + 1}`);
      matched = true;
      break;
    }
  }
  if (!matched) {
    console.log("  ✗ No match");
  }
  console.log("");
}
