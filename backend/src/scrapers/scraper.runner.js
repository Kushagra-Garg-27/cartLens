/**
 * SmartCompare Pro — Scraper Runner
 *
 * Processes pending scrape jobs from the PostgreSQL job queue.
 * Dispatches to platform-specific scraper adapters.
 * Uses FOR UPDATE SKIP LOCKED for safe concurrent processing.
 */

const db = require("../db");
const logger = require("../utils/logger");
const { checkWatchlistAlerts } = require("../services/alert.service");
const { normalizeProductUrl } = require("../utils/url.normalizer");

// ── Scraper Imports ─────────────────────────────────────────────
const amazonScraper = require("./amazon.scraper");
const flipkartScraper = require("./flipkart.scraper");
const myntraScraper = require("./myntra.scraper");
const cromaScraper = require("./croma.scraper");
const ajioScraper = require("./ajio.scraper");
const nykaaScraper = require("./nykaa.scraper");
const tatacliqScraper = require("./tatacliq.scraper");
const reliancedigitalScraper = require("./reliancedigital.scraper");
const firstcryScraper = require("./firstcry.scraper");
const blinkitScraper = require("./blinkit.scraper");
const bigbasketScraper = require("./bigbasket.scraper");
const appleindiaScraper = require("./appleindia.scraper");
const decathlonScraper = require("./decathlon.scraper");
const kitabayScraper = require("./kitabay.scraper");
const vijaysalesScraper = require("./vijaysales.scraper");

/**
 * Process one pending scrape job using FOR UPDATE SKIP LOCKED.
 * Called by cron every 2 minutes.
 */
async function processScrapeJobs() {
  // Process up to 5 jobs per cycle for faster turnaround
  const { rows } = await db.query(`
    UPDATE scrape_jobs
    SET status = 'running', attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM scrape_jobs
      WHERE  status = 'pending'
      AND    run_after <= NOW()
      AND    attempts < 5
      ORDER  BY priority ASC, created_at ASC
      LIMIT  5
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);

  if (rows.length === 0) return;

  // Process all claimed jobs in parallel
  await Promise.allSettled(rows.map(job => processOneJob(job)));
}

async function processOneJob(job) {

  const start = Date.now();

  try {
    const data = await scrapeByPlatform(job);
    if (!data) return; // Unknown platform — already handled and marked failed

    // Component 1: Scraper Result Validation
    let canonicalName = "";
    let productBrand = "";
    if (job.product_id) {
      const { rows: prodRows } = await db.query(
        "SELECT canonical_name, brand FROM products WHERE id = $1",
        [job.product_id]
      );
      if (prodRows.length > 0) {
        canonicalName = prodRows[0].canonical_name;
        productBrand = prodRows[0].brand || "";
      }
    }

    let score = 1.0;
    let matchMethod = "scraper_validated";

    if (canonicalName) {
      const scrapedTitle = data.title || "";
      const scrapedBrand = data.brand || "";
      const { matchScoreWeighted } = require("../utils/text.utils");
      score = matchScoreWeighted(scrapedTitle, scrapedBrand, canonicalName, productBrand);

      if (score < 0.45) {
        const errorMsg = `low_confidence_match: ${score.toFixed(2)}`;
        logger.warn({
          service: "scraper",
          event: "low_confidence_match",
          job_id: job.id,
          platform: job.platform,
          score: score,
          scraped_title: scrapedTitle,
          canonical_name: canonicalName
        });
        await db.query(
          "UPDATE scrape_jobs SET status = 'failed', last_error = $1 WHERE id = $2",
          [errorMsg, job.id]
        );
        return;
      } else if (score < 0.70) {
        matchMethod = "scraper_low";
      } else {
        matchMethod = "scraper_validated";
      }
    }

    await upsertListingAndPrice(data, job, score, matchMethod);
    await db.query("UPDATE scrape_jobs SET status = 'done' WHERE id = $1", [job.id]);

    // Component 5: Platform Health Success Tracking
    await db.query(
      `INSERT INTO platform_health (platform, total_attempts, success_count, success_rate, updated_at)
       VALUES ($1, 1, 1, 1.0, NOW())
       ON CONFLICT (platform) DO UPDATE SET
         total_attempts = platform_health.total_attempts + 1,
         success_count = platform_health.success_count + 1,
         success_rate = (platform_health.success_count + 1)::numeric / (platform_health.total_attempts + 1),
         updated_at = NOW()`,
      [job.platform]
    );

    const duration = Date.now() - start;
    logger.info({
      service: "scraper",
      event: "job_complete",
      job_id: job.id,
      platform: job.platform,
      duration_ms: duration,
      match_confidence: score,
      match_method: matchMethod
    });

    // Check watchlist alerts after successful scrape
    if (data.productId) {
      await checkWatchlistAlerts({
        productId: data.productId,
        platform: data.platform,
        price: data.price,
        url: data.url || job.listing_url,
      });
    }
  } catch (err) {
    const duration = Date.now() - start;

    if (job.attempts >= 5) {
      // Max attempts reached — mark as failed
      await db.query(
        "UPDATE scrape_jobs SET status = 'failed', last_error = $1 WHERE id = $2",
        [err.message, job.id]
      );

      // Component 5: Platform Health Failure Tracking (on retry exhaustion)
      await db.query(
        `INSERT INTO platform_health (platform, total_attempts, success_count, success_rate, last_failure_at, updated_at)
         VALUES ($1, 1, 0, 0.0, NOW(), NOW())
         ON CONFLICT (platform) DO UPDATE SET
           total_attempts = platform_health.total_attempts + 1,
           last_failure_at = NOW(),
           success_rate = platform_health.success_count::numeric / (platform_health.total_attempts + 1),
           updated_at = NOW()`,
        [job.platform]
      );

      logger.error({
        service: "scraper",
        event: "job_failed_permanently",
        job_id: job.id,
        platform: job.platform,
        error: err.message,
        duration_ms: duration,
      });
    } else {
      // Apply exponential backoff
      const backoff = Math.min(10 * job.attempts, 3600);
      await db.query(
        `UPDATE scrape_jobs SET status = 'pending', last_error = $1,
         run_after = NOW() + $2 * interval '1 second' WHERE id = $3`,
        [err.message, backoff, job.id]
      );
      logger.warn({
        service: "scraper",
        event: "job_retry",
        job_id: job.id,
        platform: job.platform,
        attempt: job.attempts,
        backoff_seconds: backoff,
        error: err.message,
        duration_ms: duration,
      });
    }
  }
}

/**
 * Dispatch to the correct scraper based on platform.
 * Platform keys match the `scraper` field in the platform registry.
 * @param {Object} job
 * @returns {Promise<Object>}
 */
async function scrapeByPlatform(job) {
  switch (job.platform) {
    case "amazon":
      return amazonScraper.scrape(job.listing_url);
    case "flipkart":
      return flipkartScraper.scrape(job.listing_url);
    case "myntra":
      return myntraScraper.scrape(job.listing_url);
    case "croma":
      return cromaScraper.scrape(job.listing_url);
    case "ajio":
      return ajioScraper.scrape(job.listing_url);
    case "nykaa":
      return nykaaScraper.scrape(job.listing_url);
    case "tatacliq":
      return tatacliqScraper.scrape(job.listing_url);
    case "reliancedigital":
      return reliancedigitalScraper.scrape(job.listing_url);
    case "firstcry":
      return firstcryScraper.scrape(job.listing_url);
    case "blinkit":
      return blinkitScraper.scrape(job.listing_url);
    case "bigbasket":
      return bigbasketScraper.scrape(job.listing_url);
    case "appleindia":
      return appleindiaScraper.scrape(job.listing_url);
    case "decathlon":
      return decathlonScraper.scrape(job.listing_url);
    case "kitabay":
      return kitabayScraper.scrape(job.listing_url);
    case "vijaysales":
      return vijaysalesScraper.scrape(job.listing_url);
    default:
      // Unknown platform — mark as failed immediately, don't waste retries
      logger.warn({
        service: "scraper",
        event: "unknown_platform",
        job_id: job.id,
        platform: job.platform,
      });
      await db.query(
        "UPDATE scrape_jobs SET status = 'failed', last_error = $1 WHERE id = $2",
        [`Unsupported platform: ${job.platform}`, job.id]
      );
      return null;
  }
}

/**
 * Upsert listing and insert price_history row from scraped data.
 * Links the listing to the product from the scrape job.
 * @param {Object} data - Scraped product data
 * @param {Object} job - The scrape job (contains product_id)
 */
async function upsertListingAndPrice(data, job, matchConfidence = 1.0, matchMethod = "scraper_validated") {
  const platformPid = data.asin || data.flipkartPid || data.styleId || data.productCode || null;
  const rawUrl = data.url || job.listing_url;
  const platform = data.platform || job.platform;
  const url = normalizeProductUrl(rawUrl, platform);
  const scrapedTitle = data.title || null;
  const bankOffers = data.bankOffers ? JSON.stringify(data.bankOffers) : '[]';
  const couponCodes = data.couponCodes ? JSON.stringify(data.couponCodes) : '[]';

  // Upsert listing
  const upsertResult = await db.query(
    `INSERT INTO listings (url, platform, platform_pid, current_price, currency, availability, last_scraped_at, product_id, match_confidence, match_method, scraped_title, bank_offers, coupon_codes)
     VALUES ($1, $2, $3, $4, 'INR', $5, NOW(), $6, $7, $8, $9, $10, $11)
     ON CONFLICT (url) DO UPDATE SET
       current_price = EXCLUDED.current_price,
       availability = EXCLUDED.availability,
       platform_pid = COALESCE(EXCLUDED.platform_pid, listings.platform_pid),
       last_scraped_at = NOW(),
       product_id = COALESCE(listings.product_id, EXCLUDED.product_id),
       match_confidence = EXCLUDED.match_confidence,
       match_method = EXCLUDED.match_method,
       scraped_title = COALESCE(EXCLUDED.scraped_title, listings.scraped_title),
       bank_offers = COALESCE(EXCLUDED.bank_offers, listings.bank_offers),
       coupon_codes = COALESCE(EXCLUDED.coupon_codes, listings.coupon_codes)
     RETURNING id, product_id`,
    [
      url, platform, platformPid, data.price, data.availability || "in_stock", job.product_id || null,
      matchConfidence, matchMethod, scrapedTitle, bankOffers, couponCodes
    ]
  );

  const listing = upsertResult.rows[0];
  data.productId = listing.product_id;

  // Store image hash if available
  if (data.imageUrl) {
    try {
      const { computeImageHash } = require("../utils/image.hasher");
      const hash = await computeImageHash(data.imageUrl);
      if (hash) {
        await db.query(
          "UPDATE listings SET image_hash = $1 WHERE id = $2",
          [hash, listing.id]
        );
      }
    } catch {
      // Image hash is non-critical — silently ignore
    }
  }

  // Insert price_history
  await db.query(
    "INSERT INTO price_history (listing_id, price, availability, source) VALUES ($1, $2, $3, 'scraper')",
    [listing.id, data.price, data.availability || "in_stock"]
  );
}

module.exports = { processScrapeJobs, scrapeByPlatform };
