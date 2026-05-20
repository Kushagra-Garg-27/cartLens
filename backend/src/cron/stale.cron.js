const db = require("../db");
const logger = require("../utils/logger");

/**
 * Enqueue priority=5 scrape jobs for listings that haven't been scraped in 4+ hours.
 * Runs every 4 hours.
 */
async function enqueueStaleListings() {
  try {
    const result = await db.query(
      `SELECT l.url, l.platform
       FROM listings l
       WHERE l.last_scraped_at < NOW() - INTERVAL '4 hours'
       AND NOT EXISTS (
         SELECT 1 FROM scrape_jobs sj
         WHERE sj.listing_url = l.url
         AND sj.status IN ('pending', 'running')
       )
       LIMIT 100`
    );

    let enqueued = 0;
    for (const row of result.rows) {
      await db.query(
        "INSERT INTO scrape_jobs (listing_url, platform, priority) VALUES ($1, $2, 5)",
        [row.url, row.platform]
      );
      enqueued++;
    }

    if (enqueued > 0) {
      logger.info({
        service: "cron",
        event: "stale_listings_enqueued",
        jobs_created: enqueued,
      });
    }
  } catch (err) {
    logger.error({
      service: "cron",
      event: "stale_enqueue_error",
      error: err.message,
    });
  }
}

module.exports = { enqueueStaleListings };
