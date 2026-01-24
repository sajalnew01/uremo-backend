const BASE_URL = "https://uremo-backend.onrender.com";

async function t() {
  const l = await fetch(BASE_URL + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "sajalnew02@gmail.com",
      password: "sajal@9547",
    }),
  });
  const d = await l.json();
  if (!d.token) return console.log("login failed");
  const tk = d.token;

  const tests = [
    ["show me available services", "LIST_SERVICES"],
    ["I want to create a new service", "ADMIN_CREATE_SERVICE"],
    ["add new service", "ADMIN_CREATE_SERVICE"],
    ["what is my name", "USER_IDENTITY_QUERY"],
    ["who are you", "ASSISTANT_IDENTITY"],
    ["1", "ORDINAL_SELECTION"],
    ["hello", "GENERAL_CHAT"],
  ];

  for (const [msg, exp] of tests) {
    const r = await fetch(BASE_URL + "/api/jarvisx/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + tk,
      },
      body: JSON.stringify({ message: msg }),
    });
    const j = await r.json();
    const ok = j.intent === exp;
    console.log(
      (ok ? "✅" : "❌") +
        " " +
        msg +
        " => " +
        j.intent +
        " (exp: " +
        exp +
        ")",
    );
  }
}

t();
