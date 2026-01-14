const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
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
