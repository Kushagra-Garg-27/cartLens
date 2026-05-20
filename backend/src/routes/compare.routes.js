const express = require("express");
const router = express.Router();
const db = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const { createRateLimiter } = require("../middleware/rate-limiter");
const config = require("../config");
const productResolver = require("../services/product.resolver");
const listingFetcher = require("../services/listing.fetcher");
const responseAssembler = require("../services/response.assembler");
const jobEnqueuer = require("../services/job.enqueuer");
const { detectCategory } = require("../utils/category.detector");
const { generateSimulatedResults } = require("../services/simulated.results");
const logger = require("../utils/logger");

const compareRateLimiter = createRateLimiter({
  max: config.rateLimit.compare,
  windowMs: 60000,
});

// POST /api/compare
router.post("/", authMiddleware, compareRateLimiter, async (req, res) => {
  try {
    const { title, price, currency, brand, modelNumber, asin, flipkartPid, url, platform } = req.body;

    if (!title || !url || !platform) {
      return res.status(400).json({
        error: "title, url, and platform are required",
        code: "VALIDATION_ERROR",
      });
    }

    // Step 1: Store extension observation (upsert listing + price_history)
    const observationData = { title, price, currency, brand, modelNumber, asin, flipkartPid, url, platform };
    await storeExtensionObservation(observationData);

    // Step 2: Try to resolve product
    const resolved = await productResolver.resolve({
      title, brand, modelNumber, asin, flipkartPid, url, platform,
    });

    if (!resolved) {
      // Cold path — no match found, create product + link listing
      const category = detectCategory({ url, title, brand });
      const productId = await createNewProduct({ title, brand, modelNumber, category });
      await linkListingToProduct(url, productId);

      // Enqueue scrape jobs and capture job IDs for polling
      let jobIds = [];
      try {
        jobIds = await jobEnqueuer.enqueueAllPlatforms(productId, platform);
      } catch (err) {
        logger.error({ service: "api", event: "enqueue_error", error: err.message });
      }

      // Return immediate results with the extension-observed listing
      const listings = await listingFetcher.fetch(productId);
      const assembled = await responseAssembler.assemble(productId, listings, req.userId);

      // If only 1 listing, use simulated results for instant demo
      if ((assembled.results || []).length <= 1) {
        const simulated = generateSimulatedResults({
          title, price, platform, url, productId,
        });

        logger.info({
          service: "api",
          event: "compare_simulated",
          user_id: req.userId.substring(0, 8),
          product_id: productId.substring(0, 8),
          results_count: simulated.results.length,
        });

        return res.json(simulated);
      }

      logger.info({
        service: "api",
        event: "compare_found",
        user_id: req.userId.substring(0, 8),
        product_id: productId.substring(0, 8),
        results_count: (assembled.results || []).length,
      });

      return res.json({
        status: "found",
        product_id: productId,
        partial: false,
        job_ids: [],
        ...assembled,
      });
    }

    // Happy path — product found
    const productId = resolved.productId;
    
    // Enterprise Polling: Check if there are still jobs running for this product
    const pendingJobsResult = await db.query(
      "SELECT count(*) FROM scrape_jobs WHERE product_id = $1 AND status IN ('pending', 'running')",
      [productId]
    );
    const pendingJobsCount = parseInt(pendingJobsResult.rows[0].count, 10);
    let isPartial = pendingJobsCount > 0;

    const listings = await listingFetcher.fetch(productId);
    const assembled = await responseAssembler.assemble(productId, listings, req.userId);

    let jobIds = [];
    if (!isPartial && assembled.results.length <= 1) {
      // No real cross-platform data — use simulated results
      const simulated = generateSimulatedResults({
        title: assembled.results[0]?.title || title,
        price: assembled.results[0]?.price || price,
        platform,
        url,
        productId,
      });

      logger.info({
        service: "api",
        event: "compare_simulated",
        user_id: req.userId ? req.userId.substring(0, 8) : 'anon',
        product_id: productId.substring(0, 8),
        results_count: simulated.results.length,
      });

      return res.json(simulated);
    }

    // If jobs are still pending, tell frontend to keep polling
    const status = isPartial ? "queued" : "found";

    logger.info({
      service: "api",
      event: isPartial ? "compare_found_partial" : "compare_found",
      user_id: req.userId ? req.userId.substring(0, 8) : 'anon',
      product_id: productId.substring(0, 8),
      results_count: assembled.results.length,
      pending_jobs: pendingJobsCount,
    });

    res.json({
      status: status,
      product_id: productId,
      partial: isPartial,
      job_ids: [],
      ...assembled,
    });
  } catch (err) {
    logger.error({
      service: "api",
      event: "compare_error",
      error: err.message,
      user_id: req.userId ? req.userId.substring(0, 8) : undefined,
    });
    res.status(500).json({ error: "Internal error", code: "SERVER_ERROR" });
  }
});

// GET /api/results/:job_id
router.get("/results/:job_id", authMiddleware, async (req, res) => {
  try {
    const { job_id } = req.params;
    const result = await db.query(
      "SELECT id, status, platform, listing_url, attempts, last_error, created_at FROM scrape_jobs WHERE id = $1",
      [job_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Job not found",
        code: "NOT_FOUND",
      });
    }

    const job = result.rows[0];
    res.json({
      job_id: job.id,
      status: job.status,
      platform: job.platform,
      listing_url: job.listing_url,
      attempts: job.attempts,
      last_error: job.last_error,
      created_at: job.created_at,
    });
  } catch (err) {
    logger.error({
      service: "api",
      event: "results_error",
      error: err.message,
    });
    res.status(500).json({ error: "Internal error", code: "SERVER_ERROR" });
  }
});

/**
 * Store the price observation from the extension as a price_history row.
 * Upserts the listing first.
 */
async function storeExtensionObservation(data) {
  const { url, platform, title, price, currency, brand, asin, flipkartPid } = data;

  // Upsert listing even with null price (so product linking works)
  const platformPid = asin || flipkartPid || null;
  const upsertResult = await db.query(
    `INSERT INTO listings (url, platform, platform_pid, current_price, currency, availability, last_scraped_at)
     VALUES ($1, $2, $3, $4, $5, 'in_stock', NOW())
     ON CONFLICT (url) DO UPDATE SET
       current_price = COALESCE(EXCLUDED.current_price, listings.current_price),
       last_scraped_at = NOW()
     RETURNING id`,
    [url, platform, platformPid, price || null, currency || "INR"]
  );

  const listingId = upsertResult.rows[0].id;

  // Only insert price_history if we have a valid price
  if (price) {
    await db.query(
      "INSERT INTO price_history (listing_id, price, availability, source) VALUES ($1, $2, 'in_stock', 'extension')",
      [listingId, price]
    );
  }
}

/**
 * Create a new product entry.
 */
async function createNewProduct(data) {
  const { title, brand, modelNumber, category } = data;
  const result = await db.query(
    "INSERT INTO products (canonical_name, brand, model_number, category) VALUES ($1, $2, $3, $4) RETURNING id",
    [title, brand || null, modelNumber || null, category || "electronics"]
  );
  return result.rows[0].id;
}

/**
 * Link an existing listing to a product.
 */
async function linkListingToProduct(url, productId) {
  await db.query(
    "UPDATE listings SET product_id = $1 WHERE url = $2 AND product_id IS NULL",
    [productId, url]
  );
}

module.exports = router;
