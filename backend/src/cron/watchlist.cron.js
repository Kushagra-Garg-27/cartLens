const db = require("../db");
const logger = require("../utils/logger");

/**
 * Enqueue priority=1 scrape jobs for all watchlisted product listings.
 * Runs every 30 minutes.
 */
async function enqueueWatchlistedProducts() {
  try {
    const result = await db.query(
      `SELECT DISTINCT l.url, l.platform
       FROM watchlist w
       JOIN listings l ON l.product_id = w.product_id
       WHERE NOT EXISTS (
         SELECT 1 FROM scrape_jobs sj
         WHERE sj.listing_url = l.url
         AND sj.status IN ('pending', 'running')
       )`
    );

    let enqueued = 0;
    for (const row of result.rows) {
      await db.query(
        "INSERT INTO scrape_jobs (listing_url, platform, priority) VALUES ($1, $2, 1)",
        [row.url, row.platform]
      );
      enqueued++;
    }

    if (enqueued > 0) {
      logger.info({
        service: "cron",
        event: "watchlist_enqueued",
        jobs_created: enqueued,
      });
    }
  } catch (err) {
    logger.error({
      service: "cron",
      event: "watchlist_enqueue_error",
      error: err.message,
    });
  }
}

module.exports = { enqueueWatchlistedProducts };
