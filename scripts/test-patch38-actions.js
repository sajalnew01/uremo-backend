/*
  PATCH_38 Action Rules Engine verification (lightweight, non-destructive).

  Checks:
  - /api/services/:id/actions returns allowedActions
  - /api/services/workspace returns only microjobs-related categories
  - /api/services/deals returns only deal-eligible services (allowedActions.deal === true)

  Usage:
    node scripts/test-patch38-actions.js
    node scripts/test-patch38-actions.js --base=https://uremo-backend.onrender.com

  Env:
    UREMO_API_BASE / BASE_URL: override base URL
*/

const DEFAULT_CANDIDATES = [
  "http://localhost:5000",
  "https://uremo-backend.onrender.com",
];

function parseArgs(argv) {
  const out = { base: null };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--base=")) out.base = raw.slice("--base=".length);
  }
  return out;
}

function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error(`${label} timed out after ${timeoutMs}ms`);
      err.name = "TimeoutError";
      reject(err);
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() =>
    clearTimeout(timeoutId),
  );
}

async function fetchJson(url, init, timeoutMs = 12000) {
  const res = await withTimeout(fetch(url, init), timeoutMs, `fetch ${url}`);
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  const isJson = contentType.includes("application/json");
  let body = text;
  if (isJson) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { res, body, text };
}

async function canReach(base) {
  try {
    const { res } = await fetchJson(`${base.replace(/\/+$/, "")}/api/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function resolveBaseUrl(cliBase) {
  const envBase = (
    process.env.UREMO_API_BASE ||
    process.env.BASE_URL ||
    ""
  ).trim();
  const preferred = (cliBase || envBase || "").trim();

  if (preferred) return preferred.replace(/\/+$/, "");

  for (const candidate of DEFAULT_CANDIDATES) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await canReach(candidate);
    if (ok) return candidate;
  }

  return "http://localhost:5000";
}

function fail(message, extra) {
  console.error(`\n❌ ${message}`);
  if (extra) console.error(extra);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`✅ ${message}`);
}

function isAllowedActionsShape(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.buy === "boolean" &&
    typeof value.apply === "boolean" &&
    typeof value.rent === "boolean" &&
    typeof value.deal === "boolean"
  );
}

function extractServicesArray(body) {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object" && Array.isArray(body.services))
    return body.services;
  return null;
}

async function testServiceActions(base) {
  const {
    res: listRes,
    body: listBody,
    text: listText,
  } = await fetchJson(`${base}/api/services`, { method: "GET" }, 15000);
  if (!listRes.ok) {
    fail(`/api/services returned HTTP ${listRes.status}`, listText);
    return;
  }

  const services = extractServicesArray(listBody);
  if (!services || services.length < 1) {
    fail("/api/services did not return a non-empty list", listText);
    return;
  }

  const pick = services.find((s) => s && s._id) || services[0];
  const id = pick?._id;
  if (!id) {
    fail(
      "Could not pick a service _id from /api/services",
      JSON.stringify(pick),
    );
    return;
  }

  const { res, body, text } = await fetchJson(
    `${base}/api/services/${id}/actions`,
    {
      method: "GET",
    },
  );

  if (!res.ok) {
    fail(`/api/services/:id/actions returned HTTP ${res.status}`, text);
    return;
  }

  const allowedActions =
    body && typeof body === "object" ? body.allowedActions : null;
  if (!isAllowedActionsShape(allowedActions)) {
    fail(
      "/api/services/:id/actions returned invalid allowedActions shape",
      text,
    );
    return;
  }

  pass("/api/services/:id/actions returns allowedActions");
}

async function testWorkspaceGuard(base) {
  const { res, body, text } = await fetchJson(
    `${base}/api/services/workspace`,
    {
      method: "GET",
    },
  );
  if (!res.ok) {
    fail(`/api/services/workspace returned HTTP ${res.status}`, text);
    return;
  }

  const services = extractServicesArray(body) || [];
  const allowedCategories = new Set(["microjobs", "writing", "online_gigs"]);

  const bad = services.filter(
    (s) => !allowedCategories.has(String(s?.category || "")),
  );
  if (bad.length) {
    fail(
      `/api/services/workspace returned non-workspace categories (${bad.length} bad items)`,
      JSON.stringify(bad.slice(0, 3), null, 2),
    );
    return;
  }

  pass(`/api/services/workspace guard ok (${services.length} items)`);
}

async function testDealsGuard(base) {
  const { res, body, text } = await fetchJson(`${base}/api/services/deals`, {
    method: "GET",
  });
  if (!res.ok) {
    fail(`/api/services/deals returned HTTP ${res.status}`, text);
    return;
  }

  const services = extractServicesArray(body) || [];

  const bad = services.filter((s) => {
    const aa = s?.allowedActions;
    return !isAllowedActionsShape(aa) || aa.deal !== true;
  });

  if (bad.length) {
    fail(
      `/api/services/deals returned non-deal-eligible items (${bad.length} bad items)`,
      JSON.stringify(bad.slice(0, 3), null, 2),
    );
    return;
  }

  pass(`/api/services/deals guard ok (${services.length} items)`);
}

async function main() {
  console.log("\nPATCH_38 action rules checks");

  const args = parseArgs(process.argv);
  const base = await resolveBaseUrl(args.base);
  console.log(`Base: ${base}`);

  await testServiceActions(base);
  await testWorkspaceGuard(base);
  await testDealsGuard(base);

  if (process.exitCode && process.exitCode !== 0) {
    console.error("\nSome PATCH_38 checks failed.");
    process.exit(process.exitCode);
  }

  console.log("\nAll PATCH_38 checks passed.");
}

main().catch((err) => {
  fail("Unexpected error", err?.stack || String(err));
  process.exit(process.exitCode || 1);
});
