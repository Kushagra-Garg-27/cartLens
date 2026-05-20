/**
 * SmartCompare Pro — Job Enqueuer (Category-Aware Platform Routing)
 *
 * Uses the centralized platform registry for search URLs.
 * Only enqueues scrape jobs for platforms that match the product's category.
 * Never enqueue a fashion platform for electronics. Never enqueue grocery for laptops.
 */

const db = require("../db");
const logger = require("../utils/logger");
const PLATFORMS = require("../config/platforms");
const { detectCategory } = require("../utils/category.detector");

/**
 * Get platform keys that support a given category, excluding the source platform.
 * @param {string} category
 * @param {string} sourcePlatform - Platform the user is currently on
 * @returns {string[]} Array of platform keys
 */
function getPlatformsForCategory(category, sourcePlatform) {
  return Object.entries(PLATFORMS)
    .filter(([key, p]) => p.categories.includes(category) && key !== sourcePlatform)
    .map(([key]) => key);
}

/**
 * Enqueue scrape jobs for all category-matching platforms except the source.
 * Used in the cold path when a new product is first seen.
 * @param {string} productId
 * @param {string} excludePlatform - Platform the user is currently on
 * @returns {Promise<string[]>} Array of job IDs
 */
async function enqueueAllPlatforms(productId, excludePlatform) {
  const jobIds = [];
  const product = await db.query(
    "SELECT canonical_name, brand, category FROM products WHERE id = $1",
    [productId]
  );

  if (product.rows.length === 0) return jobIds;

  const { canonical_name, brand, category } = product.rows[0];
  const searchQuery = brand
    ? `${brand} ${canonical_name}`
    : canonical_name;

  // Detect category from product data (fallback to stored category)
  const detectedCategory = category || detectCategory({ title: canonical_name, brand });
  const targetPlatforms = getPlatformsForCategory(detectedCategory, excludePlatform);

  for (const platformKey of targetPlatforms) {
    const platformConfig = PLATFORMS[platformKey];
    if (!platformConfig) continue;

    const searchUrl = platformConfig.searchUrl(searchQuery);

    // Check for existing pending/running jobs to prevent spam
    const existing = await db.query(
      "SELECT id FROM scrape_jobs WHERE product_id = $1 AND platform = $2 AND status IN ('pending', 'running')",
      [productId, platformConfig.scraper]
    );

    if (existing.rows.length === 0) {
      // Use the scraper key for the platform column (maps to scraper dispatch)
      const result = await db.query(
        `INSERT INTO scrape_jobs (product_id, listing_url, platform, priority)
         VALUES ($1, $2, $3, 5)
         RETURNING id`,
        [productId, searchUrl, platformConfig.scraper]
      );
      jobIds.push(result.rows[0].id);
    }
  }

  logger.info({
    service: "api",
    event: "jobs_enqueued",
    product_id: productId.substring(0, 8),
    category: detectedCategory,
    job_count: jobIds.length,
    platforms: targetPlatforms.join(","),
  });

  return jobIds;
}

/**
 * Enqueue scrape jobs for a specific product (all its existing listings).
 * Used for watchlist priority re-scraping.
 * @param {string} productId
 * @param {number} priority
 */
async function enqueueForProduct(productId, priority = 5) {
  const listings = await db.query(
    "SELECT url, platform FROM listings WHERE product_id = $1",
    [productId]
  );

  for (const listing of listings.rows) {
    // Check if a pending/running job already exists for this URL
    const existing = await db.query(
      "SELECT id FROM scrape_jobs WHERE listing_url = $1 AND status IN ('pending', 'running')",
      [listing.url]
    );

    if (existing.rows.length === 0) {
      await db.query(
        "INSERT INTO scrape_jobs (product_id, listing_url, platform, priority) VALUES ($1, $2, $3, $4)",
        [productId, listing.url, listing.platform, priority]
      );
    }
  }
}

/**
 * Build a search URL for a given platform using the platform registry.
 * @param {string} platform - Platform scraper key
 * @param {string} query
 * @returns {string}
 */
function buildSearchUrl(platform, query) {
  // Find platform config by scraper key
  const entry = Object.values(PLATFORMS).find((p) => p.scraper === platform);
  if (entry) {
    return entry.searchUrl(query);
  }
  // Fallback for unknown platforms
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

module.exports = { enqueueAllPlatforms, enqueueForProduct, buildSearchUrl, getPlatformsForCategory };
