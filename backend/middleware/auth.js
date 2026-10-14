// middleware/auth.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "zero-hunger-connect-secret-v2";

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: `Access denied. Required role: ${roles.join(" or ")}` });
    }
    next();
  };
}

// Middleware: only allow access to own resources (or admin override)
export function requireOwnerOrAdmin(getOwnerId) {
  return (req, res, next) => {
    if (req.user.role === "admin") return next();
    const ownerId = getOwnerId(req);
    if (req.user._id !== ownerId) {
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };
}
