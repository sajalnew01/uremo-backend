// Quick test for admin routes availability
const BASE = "https://uremo-backend.onrender.com";

async function main() {
  console.log("Testing admin routes availability...");

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    }),
  }).then((r) => r.json());

  if (!login.token) {
    console.log("Login failed:", login);
    return;
  }
  console.log("✅ Login OK, role:", login.user?.role);

  const headers = { Authorization: `Bearer ${login.token}` };

  const routes = [
    "/api/admin/services",
    "/api/admin/work-positions",
    "/api/admin/users",
    "/api/admin/workspace/jobs",
    "/api/admin/apply-work",
    "/api/apply-work/all",
  ];

  console.log("\nRoute availability:");
  for (const route of routes) {
    const res = await fetch(`${BASE}${route}`, { headers });
    const emoji = res.status === 200 ? "✅" : res.status === 404 ? "❌" : "⚠️";
    console.log(`${emoji} ${route} -> ${res.status}`);
  }
}

main().catch(console.error);
