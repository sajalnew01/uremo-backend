/*
  PATCH_48: Proof of Work end-to-end verification

  What it checks (minimal but meaningful):
  A) Worker flow: apply -> admin sets ready -> assigned project -> submit proof -> pending
  B) Admin flow: approve proof -> project completed -> earnings credited
  C) Security: non-admin can't access admin proofs; unauth can't access worker proofs
  D) Public: no public proof endpoint (404)

  Usage:
    node scripts/test-patch48-proof.js --base=http://localhost:5000

  Env:
    UREMO_API_BASE / BASE_URL: base URL override
    TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD: admin login

  Notes:
    - This script avoids file uploads by using resumeUrl.
    - It uses admin endpoints to move worker to ready_to_work.
*/

const DEFAULT_BASE =
  (process.env.UREMO_API_BASE || process.env.BASE_URL || "").trim() ||
  "http://localhost:5000";

function isInteractiveTty() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function promptLine(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (data) => {
      chunks.push(String(data));
      resolve(chunks.join("").trim());
    });
  });
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const readline = require("readline");
    const { Writable } = require("stream");

    let muted = false;
    const mutableStdout = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) {
          process.stdout.write(chunk, encoding);
        }
        callback();
      },
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: true,
    });

    rl.question(question, (answer) => {
      muted = false;
      rl.close();
      resolve(String(answer || ""));
    });

    muted = true;
  });
}

function parseArgs(argv) {
  const out = {
    base: DEFAULT_BASE,
    adminEmail:
      String(
        process.env.TEST_ADMIN_EMAIL || process.env.TEST_EMAIL || "",
      ).trim() || null,
    adminPassword:
      String(
        process.env.TEST_ADMIN_PASSWORD || process.env.TEST_PASSWORD || "",
      ) || null,
  };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--base=")) out.base = raw.slice("--base=".length);
    else if (raw.startsWith("--email="))
      out.adminEmail = raw.slice("--email=".length);
    else if (raw.startsWith("--password="))
      out.adminPassword = raw.slice("--password=".length);
  }
  out.base = String(out.base || "").replace(/\/+$/, "");
  return out;
}

function log(msg) {
  console.log(`• ${msg}`);
}
function ok(msg) {
  console.log(`✅ ${msg}`);
}
function fail(msg, extra) {
  console.error(`❌ ${msg}`);
  if (extra) console.error(extra);
  process.exitCode = 1;
  throw new Error(msg);
}

async function fetchJson(
  base,
  path,
  { method = "GET", token, body, headers } = {},
) {
  const url = `${base}${path}`;
  const init = {
    method,
    headers: {
      Accept: "application/json",
      ...(headers || {}),
    },
  };

  if (token) init.headers.Authorization = `Bearer ${token}`;

  if (body && typeof body === "object" && !(body instanceof FormData)) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    init.body = body;
  }

  const res = await fetch(url, init);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { ok: res.ok, status: res.status, data };
}

async function run() {
  const {
    base,
    adminEmail: argEmail,
    adminPassword: argPassword,
  } = parseArgs(process.argv);
  console.log("\nPATCH_48 Proof-of-Work Test");
  console.log(`Base: ${base}`);

  let adminEmail = String(argEmail || "").trim();
  let adminPassword = String(argPassword || "");

  if ((!adminEmail || !adminPassword) && isInteractiveTty()) {
    if (!adminEmail) {
      adminEmail = String(
        (await promptLine("Enter admin email: ")) || "",
      ).trim();
    }
    if (!adminPassword) {
      adminPassword = String(
        (await promptHidden("Enter admin password: ")) || "",
      );
      process.stdout.write("\n");
    }
  }

  if (!adminEmail) {
    fail(
      "Missing admin email. Provide --email=... or set TEST_ADMIN_EMAIL/TEST_EMAIL.",
    );
  }
  if (!adminPassword) {
    fail(
      "Missing admin password. Provide --password=... or set TEST_ADMIN_PASSWORD/TEST_PASSWORD.",
    );
  }

  // Health
  {
    const r = await fetchJson(base, "/api/health");
    if (!r.ok) fail("/api/health not reachable", r);
    ok("Health ok");
  }

  // Admin login
  const adminLogin = await fetchJson(base, "/api/auth/login", {
    method: "POST",
    body: { email: adminEmail, password: adminPassword },
  });
  if (!adminLogin.ok || !adminLogin.data?.token) {
    fail("Admin login failed", adminLogin);
  }
  const adminToken = adminLogin.data.token;
  ok("Admin login ok");

  // Create two users (worker + other)
  const ts = Date.now();
  const workerEmail = `patch48_worker_${ts}@test.com`;
  const otherEmail = `patch48_other_${ts}@test.com`;
  const password = "Test@123";

  const workerSignup = await fetchJson(base, "/api/auth/signup", {
    method: "POST",
    body: { name: "Patch48 Worker", email: workerEmail, password },
  });
  if (!workerSignup.ok || !workerSignup.data?.token) {
    fail("Worker signup failed", workerSignup);
  }
  const workerToken = workerSignup.data.token;
  ok("Worker signup ok");

  const otherSignup = await fetchJson(base, "/api/auth/signup", {
    method: "POST",
    body: { name: "Patch48 Other", email: otherEmail, password },
  });
  if (!otherSignup.ok || !otherSignup.data?.token) {
    fail("Other user signup failed", otherSignup);
  }
  const otherToken = otherSignup.data.token;
  ok("Other user signup ok");

  // No public proof route
  {
    const r = await fetchJson(base, "/api/proofs/public");
    if (r.status !== 404) {
      fail("Expected /api/proofs/public to be 404 (no public proof routes)", r);
    }
    ok("Public proof endpoint not exposed (404)");
  }

  // Security: unauth access denied
  {
    const r = await fetchJson(base, "/api/workspace/my-proofs");
    if (r.status !== 401) {
      fail("Expected /api/workspace/my-proofs to require auth (401)", r);
    }
    ok("Unauth proof access blocked (401)");
  }

  // Security: non-admin can't access admin proofs
  {
    const r = await fetchJson(base, "/api/admin/proofs", {
      token: workerToken,
    });
    if (r.status !== 403) {
      fail("Expected worker to be forbidden from /api/admin/proofs (403)", r);
    }
    ok("Worker blocked from admin proofs (403)");
  }

  // Get work positions
  const positionsRes = await fetchJson(base, "/api/work-positions");
  if (!positionsRes.ok) fail("Failed to fetch work positions", positionsRes);
  const positions = Array.isArray(positionsRes.data?.positions)
    ? positionsRes.data.positions
    : Array.isArray(positionsRes.data)
      ? positionsRes.data
      : [];

  if (!positions.length) {
    fail(
      "No work positions found. Create at least one WorkPosition before running this test.",
      positionsRes,
    );
  }
  const positionId = positions[0]._id;
  log(`Using work position: ${positionId}`);

  // Apply to work (multipart form-data with resumeUrl)
  const fd = new FormData();
  fd.append("positionId", String(positionId));
  fd.append("message", "PATCH_48 test application");
  fd.append("resumeUrl", "https://example.com/resume.pdf");

  const applyRes = await fetchJson(base, "/api/apply-work", {
    method: "POST",
    token: workerToken,
    body: fd,
  });
  if (!applyRes.ok || !applyRes.data?._id) {
    fail("Worker apply-work failed", applyRes);
  }
  const applicationId = applyRes.data._id;
  ok(`Worker application created (${applicationId})`);

  // Admin: approve application status
  {
    const r = await fetchJson(base, `/api/apply-work/admin/${applicationId}`, {
      method: "PUT",
      token: adminToken,
      body: { status: "approved" },
    });
    if (!r.ok) fail("Admin failed to approve application status", r);
    ok("Admin approved application status");
  }

  // Admin: set workerStatus ready_to_work
  {
    const r = await fetchJson(
      base,
      `/api/admin/workspace/worker/${applicationId}/status`,
      {
        method: "PUT",
        token: adminToken,
        body: { workerStatus: "ready_to_work" },
      },
    );
    if (!r.ok) fail("Admin failed to set workerStatus ready_to_work", r);
    ok("Admin set workerStatus=ready_to_work");
  }

  // Admin: create a project
  const projectRes = await fetchJson(base, "/api/admin/workspace/projects", {
    method: "POST",
    token: adminToken,
    body: {
      title: `PATCH_48 Test Project ${ts}`,
      description: "Automated test project for proof-of-work flow",
      category: "microjobs",
      instructions: "Submit proof via PATCH_48 endpoint",
      deliverables: [
        { title: "Proof", description: "Screenshot/link", required: true },
      ],
      payRate: 5,
      payType: "fixed",
      estimatedTasks: 1,
    },
  });
  if (!projectRes.ok || !projectRes.data?.project?._id) {
    fail("Admin create project failed", projectRes);
  }
  const projectId = projectRes.data.project._id;
  ok(`Admin created project (${projectId})`);

  // Admin: assign project to worker application
  {
    const r = await fetchJson(
      base,
      `/api/admin/workspace/project/${projectId}/assign`,
      {
        method: "PUT",
        token: adminToken,
        body: { workerId: applicationId },
      },
    );
    if (!r.ok) fail("Admin assign project failed", r);
    ok("Project assigned to worker");
  }

  // Worker: start project
  {
    const r = await fetchJson(
      base,
      `/api/workspace/project/${projectId}/start`,
      {
        method: "POST",
        token: workerToken,
      },
    );
    if (!r.ok) fail("Worker start project failed", r);
    ok("Worker started project");
  }

  // Worker: submit proof
  {
    const r = await fetchJson(
      base,
      `/api/workspace/project/${projectId}/proof`,
      {
        method: "POST",
        token: workerToken,
        body: {
          submissionText: "PATCH_48 automated proof submission",
          attachments: [],
        },
      },
    );
    if (!r.ok) fail("Worker submit proof failed", r);
    ok("Worker proof submitted");
  }

  // Worker: see own proofs => pending
  let proofId = null;
  {
    const r = await fetchJson(base, "/api/workspace/my-proofs", {
      method: "GET",
      token: workerToken,
    });
    if (!r.ok) fail("Worker get my-proofs failed", r);
    const proofs = Array.isArray(r.data?.proofs) ? r.data.proofs : [];
    const proof = proofs.find(
      (p) => String(p.projectId?._id || p.projectId) === String(projectId),
    );
    if (!proof) fail("Worker proof not found in my-proofs list", r);
    if (proof.status !== "pending") {
      fail(`Expected proof status pending, got ${proof.status}`, proof);
    }
    proofId = proof._id;
    ok("Worker sees proof pending");
  }

  // Security: other user cannot see worker proofs
  {
    const r = await fetchJson(base, "/api/workspace/my-proofs", {
      method: "GET",
      token: otherToken,
    });
    if (!r.ok) fail("Other user get my-proofs failed", r);
    const proofs = Array.isArray(r.data?.proofs) ? r.data.proofs : [];
    if (proofs.some((p) => String(p._id) === String(proofId))) {
      fail("Other user unexpectedly saw worker proof", proofs);
    }
    ok("Other user cannot see worker proofs");
  }

  // Admin: approve proof
  {
    const r = await fetchJson(base, `/api/admin/proofs/${proofId}/approve`, {
      method: "PUT",
      token: adminToken,
      body: {},
    });
    if (!r.ok) fail("Admin approve proof failed", r);
    ok("Admin approved proof");
  }

  // Verify: project completed
  {
    const r = await fetchJson(base, `/api/workspace/project/${projectId}`, {
      method: "GET",
      token: workerToken,
    });
    if (!r.ok) fail("Worker get project failed", r);
    const status = r.data?.project?.status;
    const credited = Number(r.data?.project?.earningsCredited || 0);
    if (status !== "completed") {
      fail(`Expected project status completed, got ${status}`, r.data?.project);
    }
    if (!(credited > 0)) {
      fail(
        `Expected project earningsCredited > 0, got ${credited}`,
        r.data?.project,
      );
    }
    ok("Project marked completed and credited");
  }

  // Verify: worker earnings increased
  {
    const r = await fetchJson(base, "/api/workspace/earnings", {
      method: "GET",
      token: workerToken,
    });
    if (!r.ok) fail("Worker get earnings failed", r);
    const total = Number(r.data?.totalEarnings || 0);
    if (total < 5) {
      fail(`Expected worker totalEarnings >= 5, got ${total}`, r.data);
    }
    ok("Worker earnings credited (totalEarnings)");
  }

  ok("PATCH_48 PoW test completed successfully");
}

run().catch((err) => {
  if (!process.exitCode) process.exitCode = 1;
  console.error(err?.message || err);
});
