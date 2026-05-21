const alertService = require("../services/alert.service");
const logger = require("../utils/logger");

/**
 * Scan watchlists and send heads-up emails 3 days before upcoming sale events.
 * Runs daily at 9:00 AM.
 */
async function runSalePrealerts() {
  logger.info({
    service: "cron",
    event: "sale_prealerts_started"
  });

  try {
    await alertService.sendSalePreAlerts();
    logger.info({
      service: "cron",
      event: "sale_prealerts_completed"
    });
  } catch (err) {
    logger.error({
      service: "cron",
      event: "sale_prealerts_error",
      error: err.message
    });
  }
}

module.exports = { runSalePrealerts };
