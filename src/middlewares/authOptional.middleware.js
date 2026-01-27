const jwt = require("jsonwebtoken");

function extractToken(req) {
  const headerToken = req.headers.authorization?.split(" ")?.[1];
  if (typeof headerToken === "string" && headerToken.trim()) return headerToken;
  return null;
}

module.exports = (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();

  if (!process.env.JWT_SECRET) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const normalized = {
      ...(decoded && typeof decoded === "object" ? decoded : {}),
    };
    normalized.id =
      normalized.id || normalized._id || normalized.userId || normalized.uid;
    req.user = normalized;
  } catch {
    // Optional auth: ignore invalid token
  }

  return next();
};
