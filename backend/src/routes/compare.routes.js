/**
 * CHANGES:
 * - Added GET /recommendations/:product_id route (AI-powered via Gemini 2.5 Flash)
 * - In-memory cache (1hr TTL) to avoid redundant API calls
 * - Endpoint URL from content.js: /api/compare/recommendations/:product_id
 */
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
// const { generateSimulatedResults } = require("../services/simulated.results");
const logger = require("../utils/logger");
const ranker = require("../services/ranker.service");
const { normalizePlatform } = require("../utils/platform.normalizer");
const { normalizeProductUrl } = require("../utils/url.normalizer");

const { getAIRecommendations } = require("../services/ai.recommendations");
const { extractAttributes } = require("../services/ai.attributes");
const { generateAndStoreHistory } = require("../services/ai.history");
const { processScrapeJobs } = require("../scrapers/scraper.runner");

const compareRateLimiter = createRateLimiter({
  max: config.rateLimit.compare,
  windowMs: 60000,
});

// In-memory cache for AI recommendations (1 hour TTL, max 500 entries)
const recommendationsCache = new Map();
const RECOMMENDATIONS_TTL = 3600000; // 1 hour in ms
const RECOMMENDATIONS_MAX_SIZE = 500;

// Periodic cache eviction — every 10 minutes, remove expired entries
// .unref() allows clean process exit (important for tests)
const _cacheEvictionTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of recommendationsCache) {
    if (now - val.ts > RECOMMENDATIONS_TTL) {
      recommendationsCache.delete(key);
    }
  }
}, 600000); // 10 minutes
_cacheEvictionTimer.unref();

// GET /api/compare/recommendations/:product_id
router.get("/recommendations/:product_id", authMiddleware, async (req, res) => {
  try {
    const { product_id } = req.params;

    // Check cache
    const cached = recommendationsCache.get(product_id);
    if (cached && Date.now() - cached.ts < RECOMMENDATIONS_TTL) {
      return res.json({ recommendations: cached.data });
    }

    // Fetch product from DB
    const productResult = await db.query(
      "SELECT canonical_name, brand, category FROM products WHERE id = $1",
      [product_id]
    );
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: "Product not found", code: "NOT_FOUND" });
    }
    const product = productResult.rows[0];

    // Fetch latest price
    const priceResult = await db.query(
      "SELECT price FROM price_history ph JOIN listings l ON l.id = ph.listing_id WHERE l.product_id = $1 ORDER BY ph.scraped_at DESC LIMIT 1",
      [product_id]
    );
    const latestPrice = priceResult.rows.length > 0 ? parseFloat(priceResult.rows[0].price) : null;

    // Call AI with timeout race
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("AI timeout")), 8000));
    const recommendations = await Promise.race([
      getAIRecommendations({
        title: product.canonical_name,
        price: latestPrice,
        category: product.category,
        brand: product.brand,
      }),
      timeout,
    ]).catch((err) => {
      logger.error({ service: "api", event: "ai_recommendations_error", error: err.message, product_id: product_id.substring(0, 8) });
      return [];
    });

    // Cache result (enforce max size)
    if (recommendationsCache.size >= RECOMMENDATIONS_MAX_SIZE) {
      const oldestKey = recommendationsCache.keys().next().value;
      recommendationsCache.delete(oldestKey);
    }
    recommendationsCache.set(product_id, { data: recommendations, ts: Date.now() });

    logger.info({
      service: "api",
      event: "recommendations_served",
      product_id: product_id.substring(0, 8),
      count: recommendations.length,
      cached: false,
    });

    return res.json({ recommendations });
  } catch (err) {
    logger.error({ service: "api", event: "recommendations_error", error: err.message });
    res.status(500).json({ error: "Internal error", code: "SERVER_ERROR" });
  }
});
router.post("/", authMiddleware, compareRateLimiter, async (req, res) => {
  try {
    const { title, price, currency, brand, modelNumber, asin, flipkartPid, url: rawUrl, platform: rawPlatform, availability } = req.body;

    if (!title || !rawUrl || !rawPlatform) {
      return res.status(400).json({
        error: "title, url, and platform are required",
        code: "VALIDATION_ERROR",
      });
    }

    const platform = normalizePlatform(rawPlatform);
    const url = normalizeProductUrl(rawUrl, platform);

    // Step 1: Store extension observation (upsert listing + price_history)
    const observationData = { title, price, currency, brand, modelNumber, asin, flipkartPid, url, platform, availability };
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

      // Enqueue scrape jobs for other platforms
      let jobIds = [];
      try {
        jobIds = await jobEnqueuer.enqueueAllPlatforms(productId, platform);
        if (jobIds.length > 0) {
          processScrapeJobs().catch(err => {
            logger.error({ service: "api", event: "bg_scrape_error", error: err.message });
          });
          await new Promise(resolve => setTimeout(resolve, 3000)); // 3s head start for fast scrapers
        }
      } catch (err) {
        logger.error({ service: "api", event: "enqueue_error", error: err.message });
      }

      // Return the single real extension-observed listing immediately
      const listings = await listingFetcher.fetch(productId);
      const assembled = await responseAssembler.assemble(productId, listings, req.userId);

      // Annotate results with age info
      annotateResultsWithAge(assembled.results || []);

      // Fetch product title & category
      const productRow = await db.query("SELECT canonical_name, brand, category FROM products WHERE id = $1", [productId]);
      const product_title = (productRow.rows[0] && productRow.rows[0].canonical_name) || title || "Product";
      const fetchedCategory = (productRow.rows[0] && productRow.rows[0].category) || "general";

      // Personalized ranking
      if (assembled.results && assembled.results.length > 1) {
        assembled.results = await ranker.rankResults(req.userId, assembled.results, fetchedCategory);
      }

      logger.info({
        service: "api",
        event: "compare_queued",
        user_id: req.userId.substring(0, 8),
        product_id: productId.substring(0, 8),
        results_count: (assembled.results || []).length,
        job_count: jobIds.length,
      });

      return res.json({
        status: "queued",
        product_id: productId,
        product_title,
        partial: true,
        job_ids: jobIds,
        ...assembled,
      });
    }

    // Happy path — product found
    const productId = resolved.productId;
    await linkListingToProduct(url, productId);

    // Expire stale pending/running jobs (older than 5 minutes)
    await db.query(
      "UPDATE scrape_jobs SET status = 'failed', last_error = 'expired' WHERE product_id = $1 AND status IN ('pending', 'running') AND created_at < NOW() - INTERVAL '5 minutes'",
      [productId]
    );

    // Fetch real listings from the database
    const listings = await listingFetcher.fetch(productId);
    const assembled = await responseAssembler.assemble(productId, listings, req.userId);
    let results = assembled.results || [];

    // Annotate each result with freshness metadata
    annotateResultsWithAge(results);

    // Personalized ranking
    if (results.length > 1) {
      const productRow = await db.query("SELECT category FROM products WHERE id = $1", [productId]);
      const category = (productRow.rows[0] && productRow.rows[0].category) || "general";
      results = await ranker.rankResults(req.userId, results, category);
      assembled.results = results;
    }

    // Enqueue refresh jobs for stale listings (last_scraped_at > 30 minutes ago)
    const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
    let enqueuedRefresh = false;
    for (const listing of listings) {
      if (listing.last_scraped_at) {
        const age = Date.now() - new Date(listing.last_scraped_at).getTime();
        if (age > STALE_THRESHOLD_MS) {
          try {
            const jobId = await jobEnqueuer.enqueueForListing(listing.listing_id, listing.platform, 3);
            if (jobId) {
              enqueuedRefresh = true;
            }
          } catch (err) {
            logger.error({ service: "api", event: "refresh_enqueue_error", listing_id: listing.listing_id, error: err.message });
          }
        }
      }
    }
    if (enqueuedRefresh) {
      processScrapeJobs().catch(err => {
        logger.error({ service: "api", event: "bg_scrape_error", error: err.message });
      });
    }

    // Fetch product title
    const productRow = await db.query("SELECT canonical_name, brand FROM products WHERE id = $1", [productId]);
    const product_title = (productRow.rows[0] && productRow.rows[0].canonical_name) || title || "Product";

    // Always enqueue scrape jobs for missing platforms (jobEnqueuer handles deduping with existing jobs/listings)
    let jobIds = [];
    try {
      jobIds = await jobEnqueuer.enqueueAllPlatforms(productId, platform);
      if (jobIds.length > 0) {
        processScrapeJobs().catch(err => {
          logger.error({ service: "api", event: "bg_scrape_error", error: err.message });
        });
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3s head start for fast scrapers
      }
    } catch (err) {
      logger.error({ service: "api", event: "enqueue_error", error: err.message });
    }

    if (jobIds.length === 0) {
      // No new jobs enqueued — return all real data (we are done)
      logger.info({
        service: "api",
        event: "compare_found",
        user_id: req.userId ? req.userId.substring(0, 8) : "anon",
        product_id: productId.substring(0, 8),
        results_count: results.length,
      });

      return res.json({
        status: "found",
        product_id: productId,
        product_title,
        partial: false,
        job_ids: [],
        ...assembled,
      });
    }

    logger.info({
      service: "api",
      event: "compare_partial",
      user_id: req.userId ? req.userId.substring(0, 8) : "anon",
      product_id: productId.substring(0, 8),
      results_count: results.length,
      job_count: jobIds.length,
    });

    return res.json({
      status: "partial",
      product_id: productId,
      product_title,
      partial: true,
      job_ids: jobIds,
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
  const { url: rawUrl, platform, title, price, currency, brand, asin, flipkartPid, availability } = data;
  const url = normalizeProductUrl(rawUrl, platform);
  const stockStatus = availability || 'in_stock';

  // Upsert listing even with null price (so product linking works)
  const platformPid = asin || flipkartPid || null;
  const upsertResult = await db.query(
    `INSERT INTO listings (url, platform, platform_pid, current_price, currency, availability, last_scraped_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (url) DO UPDATE SET
       current_price = COALESCE(EXCLUDED.current_price, listings.current_price),
       availability = EXCLUDED.availability,
       last_scraped_at = NOW()
     RETURNING id, (xmax = 0) AS is_inserted`,
    [url, platform, platformPid, price || null, currency || "INR", stockStatus]
  );

  const listingId = upsertResult.rows[0].id;
  const isInserted = upsertResult.rows[0].is_inserted;

  // Only insert price_history if we have a valid price
  if (price) {
    await db.query(
      "INSERT INTO price_history (listing_id, price, availability, source) VALUES ($1, $2, $3, 'extension')",
      [listingId, price, stockStatus]
    );

    // If this is a brand new listing, simulate historical data for the chart (runs in background)
    if (isInserted) {
      // detect category purely for the prompt
      const { detectCategory } = require("../utils/category.detector");
      const category = detectCategory({ url, title, brand });
      // product_id might be null initially until resolved, so pass null. The graph will still fetch by listing.
      generateAndStoreHistory(null, listingId, platform, price, category).catch(err => {
        logger.error({ service: "api", event: "history_bg_error", error: err.message });
      });
    }
  }
}

/**
 * Create a new product entry.
 */
async function createNewProduct(data) {
  const { title, brand, modelNumber, category } = data;
  
  // Extract strict attributes using AI (adds ~2s latency but only for cold path)
  let aiType = null;
  let aiGender = null;
  let aiAttr = {};
  
  try {
    const aiResult = await extractAttributes(title);
    if (aiResult) {
      aiType = aiResult.product_type;
      aiGender = aiResult.raw_gender;
      aiAttr = aiResult.attributes || {};
      if (aiResult.model) {
        aiAttr.model = aiResult.model;
      }
    }
  } catch (err) {
    logger.warn({ service: "api", event: "ai_attributes_failed", title });
  }

  const result = await db.query(
    "INSERT INTO products (canonical_name, brand, model_number, category, ai_product_type, raw_gender, ai_attributes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
    [title, brand || null, modelNumber || null, category || "electronics", aiType, aiGender, JSON.stringify(aiAttr)]
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

/**
 * Annotate each result with ageInHours and ageWarning based on last_scraped_at.
 * Uses a 2-hour threshold for the warning.
 */
function annotateResultsWithAge(results) {
  for (const r of results) {
    if (r.last_scraped_at) {
      r.ageInHours = (Date.now() - new Date(r.last_scraped_at).getTime()) / 3600000;
      r.ageWarning = r.ageInHours > 2 ? "Price may be outdated" : null;
    } else {
      r.ageInHours = null;
      r.ageWarning = null;
    }
  }
}

// GET /api/compare/poll/:product_id
// Extension polls this after receiving status=queued or status=partial.
// Returns current listings for a product without re-triggering scrapes.
router.get("/poll/:product_id", authMiddleware, async (req, res) => {
  try {
    const { product_id } = req.params;

    const listings = await listingFetcher.fetch(product_id);
    const assembled = await responseAssembler.assemble(product_id, listings, req.userId);
    let results = assembled.results || [];

    // Annotate freshness
    annotateResultsWithAge(results);

    // Personalized ranking if multiple results
    if (results.length > 1) {
      const productRow = await db.query(
        "SELECT category, canonical_name, brand FROM products WHERE id = $1",
        [product_id]
      );
      const category = (productRow.rows[0] && productRow.rows[0].category) || "general";
      results = await ranker.rankResults(req.userId, results, category);
      assembled.results = results;

      const product_title = (productRow.rows[0] && productRow.rows[0].canonical_name) || "Product";
      return res.json({
        status: results.length >= 2 ? "found" : "partial",
        product_id,
        product_title,
        partial: results.length < 2,
        ...assembled,
      });
    }

    // Still only 1 result — check if any jobs are still running
    const pendingJobs = await db.query(
      "SELECT COUNT(*) AS cnt FROM scrape_jobs WHERE product_id = $1 AND status IN ('pending', 'running')",
      [product_id]
    );
    const stillRunning = parseInt(pendingJobs.rows[0].cnt) > 0;

    const productRow = await db.query(
      "SELECT canonical_name FROM products WHERE id = $1",
      [product_id]
    );
    const product_title = (productRow.rows[0] && productRow.rows[0].canonical_name) || "Product";

    return res.json({
      status: stillRunning ? "partial" : "found",
      product_id,
      product_title,
      partial: stillRunning,
      ...assembled,
    });
  } catch (err) {
    logger.error({ service: "api", event: "poll_error", error: err.message });
    res.status(500).json({ error: "Internal error", code: "SERVER_ERROR" });
  }
});

module.exports = router;
