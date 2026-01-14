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
const workPositionRoutes = require("./routes/workPosition.routes");
const adminWorkPositionRoutes = require("./routes/admin.workPosition.routes");
const adminPaymentRoutes = require("./routes/admin.payment.routes");
const cronRoutes = require("./routes/cron.routes");
const settingsRoutes = require("./routes/settings.routes");

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
app.use("/api/work-positions", workPositionRoutes);
app.use("/api/admin/work-positions", adminWorkPositionRoutes);
app.use("/api/cron", cronRoutes);
app.use("/api/settings", settingsRoutes);

// TEMP: Debug endpoint to list mounted routes
app.get("/api/__routes", (req, res) => {
  const routes = new Set();

  const stack =
    (app._router && app._router.stack) ||
    (app.router && app.router.stack) ||
    [];

  const cleanPrefix = (prefix) => {
    if (!prefix) return "";
    if (prefix === "/") return "";
    return prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  };

  const joinPaths = (a, b) => {
    const left = cleanPrefix(a);

    // normalize b into a string always
    const raw = b == null ? "" : Array.isArray(b) ? b[0] : String(b);

    if (!raw || raw === "/") return left || "/";

    const right = raw.startsWith("/") ? raw : `/${raw}`;
    const out = `${left}${right}`;
    return out || "/";
  };
  const getLayerMountPath = (layer) => {
    if (!layer || !layer.regexp) return "";
    if (layer.regexp.fast_slash) return "";

    let src = layer.regexp.source || "";
    if (!src || src === "^\\/?$" || src === "^$") return "";

    // Best-effort conversion of express layer regex to a human-readable mount path.
    // Common router mounts look like: ^\/api\/auth\/?(?=\/|$)
    if (src.startsWith("^")) src = src.slice(1);
    if (src.endsWith("$")) src = src.slice(0, -1);
    src = src.replaceAll("\\/?(?=\\/|$)", "");
    src = src.replaceAll("\\/", "/");
    src = src.replaceAll("(?:", "(");

    // Replace common param-ish groups with a token.
    src = src
      .replace(/\(\[\^\/\]\+\?\)/g, ":param")
      .replace(/\(\[\^\/\]\+\)/g, ":param");

    // Cleanup.
    src = src.replace(/\$/g, "");
    src = src.replace(/\^/g, "");
    if (src.endsWith("/")) src = src.slice(0, -1);
    return src;
  };

  const recordRoute = (methods, path) => {
    const methodStr = (methods || []).join(",").toUpperCase();
    routes.add(`${methodStr} ${path}`);
  };

  const walk = (layers, prefix = "") => {
    if (!Array.isArray(layers)) return;
    layers.forEach((layer) => {
      if (layer.route && layer.route.path) {
        const methods = Object.keys(layer.route.methods || {});
        const routePath = joinPaths(prefix, layer.route.path);
        recordRoute(methods, routePath);
        return;
      }

      // Mounted router
      if (layer.name === "router" && layer.handle && layer.handle.stack) {
        const mount = getLayerMountPath(layer);
        const nextPrefix = joinPaths(prefix, mount);
        walk(layer.handle.stack, nextPrefix);
      }
    });
  };

  walk(stack, "");

  const list = Array.from(routes).sort();
  res.json({ count: list.length, routes: list });
});

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
