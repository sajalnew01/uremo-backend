/*
PATCH_03 diagnosis helper

Runs simple HTTP checks against a base URL (defaults to production).
Usage:
  node scripts/patch03-diagnose.js
  BASE_URL=https://uremo-backend.onrender.com node scripts/patch03-diagnose.js
*/

const baseUrl = (
  process.env.BASE_URL || "https://uremo-backend.onrender.com"
).replace(/\/+$/, "");

async function fetchJson(path, init) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }
  return {
    url,
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    text,
    json,
  };
}

async function main() {
  console.log(`BASE_URL=${baseUrl}`);

  console.log("\n--- GET /api/jarvisx/llm-status");
  try {
    const r = await fetchJson("/api/jarvisx/llm-status", { method: "GET" });
    console.log({ status: r.status, body: r.json || r.text });
  } catch (e) {
    console.error("llm-status failed", e?.message || e);
  }

  console.log(
    "\n--- POST /api/jarvisx/chat (public, quick reply route: Buy service)"
  );
  try {
    const r = await fetchJson("/api/jarvisx/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Buy service", mode: "public" }),
    });
    console.log({
      status: r.status,
      setCookie: r.headers["set-cookie"],
      body: r.json || r.text,
    });
  } catch (e) {
    console.error("public chat failed", e?.message || e);
  }

  console.log("\n--- GET /api/jarvisx/health-report (no auth)");
  try {
    const r = await fetchJson("/api/jarvisx/health-report", { method: "GET" });
    console.log({ status: r.status, body: r.json || r.text });
  } catch (e) {
    console.error("health-report failed", e?.message || e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
