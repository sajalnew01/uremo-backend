(async () => {
  const base = "https://uremo-backend.onrender.com";

  console.log("📝 Testing SIGNUP API...\n");

  try {
    // Signup first
    const signupRes = await fetch(`${base}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Final Test",
        email: "final@uremo.online",
        password: "test1234",
      }),
    });

    const signupData = await signupRes.json();
    console.log(`Signup Status: ${signupRes.status}`);
    console.log("Signup Response:", JSON.stringify(signupData, null, 2));

    if (signupRes.status === 201 || signupRes.status === 400) {
      console.log("\n✅ User exists or was created\n");

      // Now try login
      console.log("🔐 Testing LOGIN API...\n");

      const loginRes = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "final@uremo.online",
          password: "test1234",
        }),
      });

      const loginData = await loginRes.json();
      console.log(`Login Status: ${loginRes.status}\n`);

      if (loginRes.status === 200 && loginData.token) {
        console.log("✅ LOGIN SUCCESSFUL!\n");
        console.log("Response:");
        console.log(JSON.stringify(loginData, null, 2));
        console.log(
          "\n📋 Token (first 50 chars):",
          loginData.token.substring(0, 50) + "..."
        );

        // Test protected route
        console.log("\n\n🔒 Testing PROTECTED ROUTE...\n");

        const ordersRes = await fetch(`${base}/api/orders/my`, {
          headers: {
            Authorization: `Bearer ${loginData.token}`,
          },
        });

        const ordersText = await ordersRes.text();
        console.log(`Status Code: ${ordersRes.status}`);
        console.log("Response:", ordersText);

        if (ordersRes.status === 200) {
          console.log("\n✅ PROTECTED ROUTE WORKS!");
        } else {
          console.log("\n⚠️ Protected route status:", ordersRes.status);
        }
      } else {
        console.log("❌ LOGIN FAILED\n");
        console.log("Response:");
        console.log(JSON.stringify(loginData, null, 2));
      }
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
})();
