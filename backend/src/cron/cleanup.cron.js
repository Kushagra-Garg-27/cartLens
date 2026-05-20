const db = require("../db");
const logger = require("../utils/logger");

/**
 * Delete price_history rows older than 180 days.
 * Runs weekly (Sunday 3AM).
 */
async function cleanupOldPriceHistory() {
  try {
    const result = await db.query(
      "DELETE FROM price_history WHERE scraped_at < NOW() - INTERVAL '180 days'"
    );
    logger.info({
      service: "cron",
      event: "price_history_cleanup",
      deleted_rows: result.rowCount,
    });
  } catch (err) {
    logger.error({
      service: "cron",
      event: "price_history_cleanup_error",
      error: err.message,
    });
  }
}

/**
 * Delete completed scrape_jobs older than 7 days.
 * Runs daily (2AM).
 */
async function cleanupDoneScrapeJobs() {
  try {
    const result = await db.query(
      "DELETE FROM scrape_jobs WHERE status = 'done' AND created_at < NOW() - INTERVAL '7 days'"
    );
    logger.info({
      service: "cron",
      event: "scrape_jobs_cleanup",
      deleted_rows: result.rowCount,
    });
  } catch (err) {
    logger.error({
      service: "cron",
      event: "scrape_jobs_cleanup_error",
      error: err.message,
    });
  }
}

module.exports = { cleanupOldPriceHistory, cleanupDoneScrapeJobs };
