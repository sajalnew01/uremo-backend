/*
  Minimal backend "build" step.

  This repo is plain Node/Express (no bundling), so "build" is a syntax check.
  We intentionally use `node --check` so files are parsed but not executed.
*/

const { execFileSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

const FILES_TO_CHECK = [
  "src/server.js",
  "src/app.js",
  "src/controllers/jarvisx.lockdown.controller.js",
  "src/utils/intentClassifier.js",
  "src/services/jarvisxProviders.js",
];

function check(fileRel) {
  const fileAbs = path.join(ROOT, fileRel);
  execFileSync(process.execPath, ["--check", fileAbs], {
    stdio: "inherit",
  });
  process.stdout.write(`✅ syntax ok: ${fileRel}\n`);
}

function main() {
  process.stdout.write("\nUREMO backend build (syntax check)\n\n");
  for (const f of FILES_TO_CHECK) check(f);
  process.stdout.write("\nBuild OK.\n");
}

main();
