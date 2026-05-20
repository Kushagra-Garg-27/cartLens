const { verifyToken } = require("../auth");
const logger = require("../utils/logger");

/**
 * Express middleware: verify JWT from Authorization header, attach user_id to req.
 */
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Unauthorized",
      code: "INVALID_TOKEN",
    });
  }

  const token = header.slice(7);
  try {
    const decoded = verifyToken(token);
    req.userId = decoded.id;
    req.userEmail = decoded.email;
    next();
  } catch (err) {
    logger.warn({
      service: "api",
      event: "auth_failed",
      error: err.message,
    });
    return res.status(401).json({
      error: "Unauthorized",
      code: "INVALID_TOKEN",
    });
  }
}

module.exports = authMiddleware;
