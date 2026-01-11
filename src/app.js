// Express app configuration
const express = require("express");
const cors = require("cors");

const app = express();

const allowedOrigins = [
  "https://uremo-frontend.vercel.app",
  "https://uremo.online",
  "https://www.uremo.online",
  "http://localhost:3000",
  "http://localhost:3001",
];

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

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser clients (no Origin header)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

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
