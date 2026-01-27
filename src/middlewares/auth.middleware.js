const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const headerToken = req.headers.authorization?.split(" ")[1];

  // EventSource cannot send custom headers, so allow query token ONLY for SSE stream.
  const isSseStream =
    req.method === "GET" &&
    typeof req.path === "string" &&
    /\/messages\/stream$/.test(req.path);

  const queryToken =
    isSseStream && typeof req.query?.token === "string"
      ? req.query.token
      : null;

  const token = headerToken || queryToken;

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  if (!process.env.JWT_SECRET) {
    console.error("[AUTH] FATAL: JWT_SECRET environment variable is not set");
    return res.status(500).json({ message: "Server configuration error" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Normalize legacy token shapes to a stable contract.
    // Controllers expect: req.user.id and req.user.role
    const normalized = {
      ...(decoded && typeof decoded === "object" ? decoded : {}),
    };
    normalized.id =
      normalized.id || normalized._id || normalized.userId || normalized.uid;

    req.user = normalized;
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid token" });
  }
};
