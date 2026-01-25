// Test local intent classification
const { classifyIntent } = require("../src/utils/intentClassifier");

const tests = [
  "can i trust you",
  "is this legit",
  "can i get a refund",
  "what if service not delivered",
  "which forex platforms available",
  "how long will delivery take",
];

console.log("=== Local Intent Classification Test ===\n");
for (const t of tests) {
  console.log(`"${t}" => ${classifyIntent(t)}`);
}
