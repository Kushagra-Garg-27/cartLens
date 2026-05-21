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
 * Cleans the search query by removing color, RAM/storage specs, and parentheses.
 * @param {string} q
 * @returns {string}
 */
function cleanQueryForSearch(q) {
  if (!q) return "";
  let clean = q;
  
  // Strip prefixes like "Brand: ", "Visit the ", "Official Store of "
  clean = clean.replace(/^(?:Visit the |Brand:\s*|Official\s+Store\s+of\s*)/i, "");

  clean = clean.replace(/\([^)]*\)/g, "");
  clean = clean.replace(/\[[^\]]*\]/g, "");
  
  // Remove RAM/ROM/Storage specifications
  clean = clean.replace(/\b\d+\s*g[b]\s*(?:ram|rom|storage)?\b/gi, "");
  
  // Remove Pack specifications (e.g. Pack of 2, 4 pcs)
  clean = clean.replace(/\bpack\s+of\s+\d+\b/gi, "");
  clean = clean.replace(/\b\d+\s*pcs?\b/gi, "");
  
  // Remove shoe / clothing sizes (e.g. Size 10, UK 8)
  clean = clean.replace(/\bsize\s+\d+\b/gi, "");
  clean = clean.replace(/\bUK\s+\d+\b/gi, "");

  // Remove standalone trailing colors (e.g., " - Black", " - White")
  clean = clean.replace(/\s*-\s*(?:black|white|blue|red|green|yellow|pink|purple|gold|silver|grey|gray)\b/gi, "");

  clean = clean.replace(/[,|].*$/g, "");
  return clean.replace(/\s+/g, " ").trim();
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
    "SELECT canonical_name, brand, category, ai_product_type, ai_attributes FROM products WHERE id = $1",
    [productId]
  );

  if (product.rows.length === 0) return jobIds;

  const { canonical_name, brand, category, ai_product_type, ai_attributes } = product.rows[0];
  
  // Clean prefix noise from brand and title
  const cleanBrand = (brand || "").replace(/^(?:Visit the |Brand:\s*|Official\s+Store\s+of\s*)/i, "").trim();
  const cleanTitle = (canonical_name || "").replace(/^(?:Visit the |Brand:\s*|Official\s+Store\s+of\s*)/i, "").trim();

  // Use AI attributes to build a cleaner search query if available
  let searchQuery = "";
  if (ai_attributes && ai_attributes.model) {
    const modelStr = ai_attributes.model;
    const lowerModel = modelStr.toLowerCase();
    const lowerBrand = cleanBrand.toLowerCase();
    
    // If the model already contains the brand, don't prepend it!
    if (cleanBrand && (lowerModel.startsWith(lowerBrand) || lowerModel.includes(" " + lowerBrand) || lowerModel.includes(lowerBrand + " "))) {
      searchQuery = modelStr;
    } else {
      searchQuery = cleanBrand ? `${cleanBrand} ${modelStr}` : modelStr;
    }
  } else {
    // Fall back to the canonical name directly
    const lowerTitle = cleanTitle.toLowerCase();
    const lowerBrand = cleanBrand.toLowerCase();
    
    // If the title already contains the brand, don't prepend it!
    if (cleanBrand && (lowerTitle.startsWith(lowerBrand) || lowerTitle.includes(" " + lowerBrand) || lowerTitle.includes(lowerBrand + " "))) {
      searchQuery = cleanTitle;
    } else {
      searchQuery = cleanBrand ? `${cleanBrand} ${cleanTitle}` : cleanTitle;
    }
  }

  searchQuery = cleanQueryForSearch(searchQuery);

  // Detect category from product data (fallback to stored category)
  const detectedCategory = category || detectCategory({ title: canonical_name, brand });
  const rawTargetPlatforms = getPlatformsForCategory(detectedCategory, excludePlatform);
  const targetPlatforms = rawTargetPlatforms.filter(platformKey => {
    const lowerQuery = searchQuery.toLowerCase();
    const lowerBrand = (brand || "").toLowerCase();
    if (platformKey === "appleindia") {
      return lowerBrand.includes("apple") || 
             /\b(apple|iphone|ipad|macbook|airpods|watch|ipod)\b/.test(lowerQuery);
    }
    if (platformKey === "decathlon") {
      return detectedCategory === "sports" || 
             lowerQuery.includes("decathlon") || 
             lowerBrand.includes("decathlon");
    }
    if (platformKey === "firstcry") {
      return detectedCategory === "kids" || 
             lowerQuery.includes("firstcry") || 
             /\b(baby|kids|infant|toy|toys|maternity|diaper|diapers|toddler)\b/.test(lowerQuery);
    }
    if (platformKey === "kitabay") {
      return detectedCategory === "books" || 
             lowerQuery.includes("kitabay") ||
             /\b(book|books|novel|novels|paperback|hardcover)\b/.test(lowerQuery);
    }
    return true;
  });

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
      if (result.rows && result.rows.length > 0) {
        jobIds.push(result.rows[0].id);
      }
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

/**
 * Enqueue a scrape job for a specific listing by its listing_id.
 * Looks up the product_id and listing URL from the listings table.
 * Skips if there is already a pending/running job for this listing created in the last 30 minutes.
 * @param {string} listingId - The listing ID to refresh
 * @param {string} platform - Platform scraper key
 * @param {number} priority - Job priority (lower = higher priority)
 * @returns {Promise<string|null>} The job ID, or null if skipped
 */
async function enqueueForListing(listingId, platform, priority = 3) {
  // Look up the listing to get product_id and url
  const listingResult = await db.query(
    "SELECT id, product_id, url FROM listings WHERE id = $1",
    [listingId]
  );

  if (listingResult.rows.length === 0) {
    logger.warn({ service: "enqueuer", event: "listing_not_found", listing_id: listingId });
    return null;
  }

  const { product_id, url } = listingResult.rows[0];

  if (!product_id) {
    logger.warn({ service: "enqueuer", event: "listing_no_product", listing_id: listingId });
    return null;
  }

  // Check for existing pending/running job for this listing created in the last 30 minutes
  const existing = await db.query(
    `SELECT id FROM scrape_jobs
     WHERE listing_url = $1
       AND status IN ('pending', 'running')
       AND created_at > NOW() - INTERVAL '30 minutes'`,
    [url]
  );

  if (existing.rows.length > 0) {
    logger.info({
      service: "enqueuer",
      event: "listing_job_skipped",
      listing_id: listingId,
      existing_job_id: existing.rows[0].id,
    });
    return null;
  }

  // Insert a new scrape job with run_after = NOW()
  const result = await db.query(
    `INSERT INTO scrape_jobs (product_id, listing_url, platform, priority, run_after)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING id`,
    [product_id, url, platform, priority]
  );

  const jobId = result.rows[0].id;

  logger.info({
    service: "enqueuer",
    event: "listing_job_enqueued",
    listing_id: listingId,
    job_id: jobId,
    platform,
    priority,
  });

  return jobId;
}

module.exports = { enqueueAllPlatforms, enqueueForProduct, enqueueForListing, buildSearchUrl, getPlatformsForCategory };
