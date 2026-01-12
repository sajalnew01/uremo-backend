// Express app configuration
const express = require("express");
const cors = require("cors");

const app = express();

const isAllowedOrigin = (origin) => {
  // Allow non-browser clients (no Origin header)
  if (!origin) return true;

  return (
    origin === "https://uremo.online" ||
    origin === "https://www.uremo.online" ||
    origin === "http://localhost:3000" ||
    /^https:\/\/.*\.vercel\.app$/.test(origin)
  );
};

// Routes
const authRoutes = require("./routes/auth.routes");
const serviceRoutes = require("./routes/service.routes");
const orderRoutes = require("./routes/order.routes");
const uploadRoutes = require("./routes/upload.routes");
const adminRoutes = require("./routes/admin.routes");
const paymentRoutes = require("./routes/payment.routes");
const paymentMethodRoutes = require("./routes/paymentMethod.routes");
const workerRoutes = require("./routes/worker.routes");
const applyWorkRoutes = require("./routes/applyWork.routes");
const adminPaymentRoutes = require("./routes/admin.payment.routes");
const cronRoutes = require("./routes/cron.routes");

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    const err = new Error(`CORS blocked: ${origin}`);
    err.status = 403;
    return callback(err, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-admin-setup-secret"],
};

app.use(cors(corsOptions));
// Preflight MUST return correctly.
// Express 5 does not support "*" here (path-to-regexp). Use a regex that matches all.
app.options(/.*/, cors(corsOptions));
app.use(express.json());
// Accept legacy form submissions (or older frontend builds) where Content-Type is urlencoded.
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.json({ message: "UREMO API running" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Backend is live" });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/payments", adminPaymentRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/payment-methods", paymentMethodRoutes);
app.use("/api/workers", workerRoutes);
app.use("/api/apply-work", applyWorkRoutes);
app.use("/api/cron", cronRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res
    .status(err.status || 500)
    .json({ message: err.message || "Server error" });
});

module.exports = app;
