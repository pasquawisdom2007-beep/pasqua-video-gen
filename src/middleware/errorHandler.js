import { logger } from "../utils/logger.js";

export function errorHandler(err, req, res, _next) {
  logger.error(`Unhandled error on ${req.method} ${req.path}: ${err.message}`);

  if (err.stack) {
    logger.error(err.stack);
  }

  const status = err.status || err.statusCode || 500;

  return res.status(status).json({
    error: err.message || "Internal server error",
    status,
    path: req.path,
    timestamp: new Date().toISOString()
  });
}
