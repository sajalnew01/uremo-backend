// Express app configuration
const express = require("express");
const cors = require("cors");

const app = express();

// Routes
const authRoutes = require("./routes/auth.routes");
const serviceRoutes = require("./routes/service.routes");
const orderRoutes = require("./routes/order.routes");
const uploadRoutes = require("./routes/upload.routes");
const adminRoutes = require("./routes/admin.routes");
const paymentRoutes = require("./routes/payment.routes");
const workerRoutes = require("./routes/worker.routes");

app.use(cors());
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
app.use("/api/payment", paymentRoutes);
app.use("/api/workers", workerRoutes);

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
