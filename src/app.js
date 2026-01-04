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

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "UREMO API running" });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payment", paymentRoutes);

module.exports = app;
