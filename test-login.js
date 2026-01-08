(async () => {
  const base = "https://uremo-backend.onrender.com";

  console.log("🔐 Testing LOGIN API...\n");

  try {
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "final@uremo.online",
        password: "test1234",
      }),
    });

    const data = await res.json();
    console.log(`Status Code: ${res.status}\n`);

    if (res.status === 200 && data.token) {
      console.log("✅ LOGIN SUCCESSFUL!\n");
      console.log("Response:");
      console.log(JSON.stringify(data, null, 2));
      console.log(
        "\n📋 Token (first 50 chars):",
        data.token.substring(0, 50) + "..."
      );

      // Test protected route
      console.log("\n\n🔒 Testing PROTECTED ROUTE...\n");

      const ordersRes = await fetch(`${base}/api/orders/my`, {
        headers: {
          Authorization: `Bearer ${data.token}`,
        },
      });

      const ordersData = await ordersRes.json();
      console.log(`Status Code: ${ordersRes.status}`);
      console.log("Response:");
      console.log(JSON.stringify(ordersData, null, 2));

      if (ordersRes.status === 200) {
        console.log("\n✅ PROTECTED ROUTE WORKS!");
      } else {
        console.log("\n⚠️ Protected route returned:", ordersRes.status);
      }
    } else {
      console.log("❌ LOGIN FAILED\n");
      console.log("Response:");
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
})();
