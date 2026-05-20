const { v4: uuidv4 } = require("uuid");
const logger = require("../utils/logger");

/**
 * Structured JSON request logging middleware.
 */
function loggerMiddleware(req, res, next) {
  const requestId = uuidv4();
  req.requestId = requestId;
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const logData = {
      service: "api",
      event: "http_request",
      request_id: requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: duration,
    };

    if (req.userId) {
      logData.user_id = req.userId.substring(0, 8);
    }

    if (res.statusCode >= 500) {
      logger.error(logData);
    } else if (res.statusCode >= 400) {
      logger.warn(logData);
    } else {
      logger.info(logData);
    }
  });

  next();
}

module.exports = loggerMiddleware;
