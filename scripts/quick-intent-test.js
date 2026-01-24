const BASE_URL = "https://uremo-backend.onrender.com";
(async () => {
  const l = await fetch(BASE_URL + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "sajalnew02@gmail.com",
      password: "sajal@9547",
    }),
  });
  const { token } = await l.json();

  const tests = [
    "can i trust you",
    "is this legit",
    "can i get a refund",
    "what if service not delivered",
  ];

  for (const msg of tests) {
    const r = await fetch(BASE_URL + "/api/jarvisx/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ message: msg }),
    });
    const j = await r.json();
    console.log(msg + " => " + j.intent);
  }
})();
