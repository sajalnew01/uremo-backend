const http = require("http");

const data = JSON.stringify({
  name: "Test User",
  email: `testuser${Date.now()}@example.com`,
  password: "testpass123",
});

const options = {
  hostname: "localhost",
  port: 5000,
  path: "/api/auth/signup",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": data.length,
  },
};

const req = http.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);

  let responseData = "";
  res.on("data", (chunk) => {
    responseData += chunk;
  });

  res.on("end", () => {
    console.log("Response:", responseData);
  });
});

req.on("error", (error) => {
  console.error("Error:", error);
});

req.write(data);
req.end();
