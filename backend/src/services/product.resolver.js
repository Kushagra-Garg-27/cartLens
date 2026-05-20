/**
 * SmartCompare Pro — Product Resolver (4-Layer Matching Engine)
 *
 * Execution order:
 *   Layer 4 (URL cache)  → fastest path, 24h window
 *   Layer 1 (Deterministic) → ASIN, Flipkart PID, Model Number, EAN, ISBN, Myntra Style ID, Ajio Code
 *   Layer 2 (NLP)         → Weighted Jaccard with category filter
 *   Layer 3 (Image Hash)  → Fashion/beauty only, MD5 match
 *
 * Returns { productId, matchMethod, confidence } or null.
 */

const db = require("../db");
const { matchScoreWeighted } = require("../utils/text.utils");
const { detectCategory } = require("../utils/category.detector");
const logger = require("../utils/logger");

/**
 * Resolve a product from extension payload through the 4-layer pipeline.
 *
 * @param {{ title: string, brand?: string, modelNumber?: string, asin?: string, flipkartPid?: string, ean?: string, isbn?: string, imageUrl?: string, url: string, platform: string }} input
 * @returns {Promise<{ productId: string, matchMethod: string, confidence: number } | null>}
 */
async function resolve(input) {
  const {
    title, brand, modelNumber, asin, flipkartPid,
    ean, isbn, imageUrl, url, platform,
  } = input;

  // ── Layer 4: URL Cache (fastest path) ──────────────────────────
  const urlCache = await db.query(
    `SELECT product_id FROM listings
     WHERE url = $1
       AND product_id IS NOT NULL
       AND last_scraped_at > NOW() - INTERVAL '24 hours'
     LIMIT 1`,
    [url]
  );
  if (urlCache.rows.length > 0) {
    logger.info({ service: "resolver", event: "layer4_url_cache_hit", url: url.substring(0, 60) });
    return { productId: urlCache.rows[0].product_id, matchMethod: "url_cache", confidence: 1.0 };
  }

  // ── Layer 1: Deterministic Hard Identifiers ────────────────────

  // 1a. ASIN (Amazon only)
  const extractedAsin = asin || extractAsin(url);
  if (extractedAsin) {
    const result = await db.query(
      `SELECT product_id FROM listings WHERE platform = 'amazon.in' AND platform_pid = $1 AND product_id IS NOT NULL LIMIT 1`,
      [extractedAsin]
    );
    if (result.rows.length > 0) {
      logger.info({ service: "resolver", event: "layer1_asin_match" });
      return { productId: result.rows[0].product_id, matchMethod: "deterministic", confidence: 1.0 };
    }
  }

  // 1b. Flipkart PID
  const extractedFkPid = flipkartPid || extractFlipkartPid(url);
  if (extractedFkPid) {
    const result = await db.query(
      `SELECT product_id FROM listings WHERE platform = 'flipkart' AND platform_pid = $1 AND product_id IS NOT NULL LIMIT 1`,
      [extractedFkPid]
    );
    if (result.rows.length > 0) {
      logger.info({ service: "resolver", event: "layer1_flipkart_match" });
      return { productId: result.rows[0].product_id, matchMethod: "deterministic", confidence: 1.0 };
    }
  }

  // 1c. Model Number
  const extractedModel = modelNumber || extractModelNumber(title);
  if (extractedModel) {
    const result = await db.query(
      "SELECT id FROM products WHERE LOWER(model_number) = LOWER($1) LIMIT 1",
      [extractedModel]
    );
    if (result.rows.length > 0) {
      logger.info({ service: "resolver", event: "layer1_model_match", model: extractedModel });
      return { productId: result.rows[0].id, matchMethod: "model_number", confidence: 1.0 };
    }
  }

  // 1d. EAN / GTIN / Barcode
  const extractedEan = ean || extractEan(title);
  if (extractedEan) {
    const result = await db.query(
      "SELECT id FROM products WHERE ean = $1 LIMIT 1",
      [extractedEan]
    );
    if (result.rows.length > 0) {
      logger.info({ service: "resolver", event: "layer1_ean_match" });
      return { productId: result.rows[0].id, matchMethod: "ean", confidence: 1.0 };
    }
  }

  // 1e. ISBN (books only)
  const extractedIsbn = isbn || extractIsbn(title);
  if (extractedIsbn) {
    const result = await db.query(
      "SELECT id FROM products WHERE isbn = $1 LIMIT 1",
      [extractedIsbn]
    );
    if (result.rows.length > 0) {
      logger.info({ service: "resolver", event: "layer1_isbn_match" });
      return { productId: result.rows[0].id, matchMethod: "isbn", confidence: 1.0 };
    }
  }

  // 1f. Myntra Style ID
  const myntraStyleId = extractMyntraStyleId(url);
  if (myntraStyleId) {
    const result = await db.query(
      `SELECT product_id FROM listings WHERE platform = 'myntra' AND platform_pid = $1 AND product_id IS NOT NULL LIMIT 1`,
      [myntraStyleId]
    );
    if (result.rows.length > 0) {
      logger.info({ service: "resolver", event: "layer1_myntra_match" });
      return { productId: result.rows[0].product_id, matchMethod: "deterministic", confidence: 1.0 };
    }
  }

  // 1g. Ajio Product Code
  const ajioCode = extractAjioCode(url);
  if (ajioCode) {
    const result = await db.query(
      `SELECT product_id FROM listings WHERE platform = 'ajio' AND platform_pid = $1 AND product_id IS NOT NULL LIMIT 1`,
      [ajioCode]
    );
    if (result.rows.length > 0) {
      logger.info({ service: "resolver", event: "layer1_ajio_match" });
      return { productId: result.rows[0].product_id, matchMethod: "deterministic", confidence: 1.0 };
    }
  }

  // URL match without freshness constraint (fallback from Layer 4)
  const urlMatchAny = await db.query(
    "SELECT product_id FROM listings WHERE url = $1 AND product_id IS NOT NULL LIMIT 1",
    [url]
  );
  if (urlMatchAny.rows.length > 0) {
    return { productId: urlMatchAny.rows[0].product_id, matchMethod: "deterministic", confidence: 1.0 };
  }

  // ── Layer 2: NLP Attribute Matching ────────────────────────────
  const category = detectCategory({ url, title, brand });
  const candidates = await db.query(
    `SELECT id, canonical_name, brand, model_number
     FROM products
     WHERE category = $1
     ORDER BY created_at DESC
     LIMIT 500`,
    [category]
  );

  // Also check uncategorized/different categories if few results
  let allCandidates = candidates.rows;
  if (allCandidates.length < 50) {
    const fallback = await db.query(
      `SELECT id, canonical_name, brand, model_number
       FROM products
       WHERE category != $1 OR category IS NULL
       ORDER BY created_at DESC
       LIMIT 200`,
      [category]
    );
    allCandidates = [...allCandidates, ...fallback.rows];
  }

  let bestMatch = null;
  let bestScore = 0;

  for (const candidate of allCandidates) {
    const score = matchScoreWeighted(title, brand, candidate.canonical_name, candidate.brand);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  if (bestMatch && bestScore >= 0.75) {
    const method = bestScore >= 0.85 ? "nlp_high" : "nlp_likely";
    logger.info({
      service: "resolver",
      event: "layer2_nlp_match",
      product_id: bestMatch.id.substring(0, 8),
      score: bestScore.toFixed(3),
      method,
    });
    return {
      productId: bestMatch.id,
      matchMethod: method,
      confidence: Math.round(bestScore * 100) / 100,
    };
  }

  // ── Layer 3: Image Hash Matching (fashion/beauty only) ─────────
  if ((category === "fashion" || category === "beauty") && imageUrl) {
    try {
      const { computeImageHash } = require("../utils/image.hasher");
      const hash = await computeImageHash(imageUrl);

      if (hash) {
        const hashMatch = await db.query(
          `SELECT l.product_id
           FROM listings l
           WHERE l.image_hash = $1
             AND l.platform != $2
             AND l.product_id IS NOT NULL
           LIMIT 1`,
          [hash, platform]
        );

        if (hashMatch.rows.length > 0) {
          logger.info({ service: "resolver", event: "layer3_image_hash_match" });
          return {
            productId: hashMatch.rows[0].product_id,
            matchMethod: "image_hash",
            confidence: 0.85,
          };
        }
      }
    } catch (err) {
      logger.warn({ service: "resolver", event: "layer3_image_hash_error", error: err.message });
    }
  }

  // All layers exhausted — no match
  logger.info({
    service: "resolver",
    event: "no_match",
    title: title ? title.substring(0, 60) : "",
    platform,
  });
  return null;
}

// ── Identifier Extraction Helpers ──────────────────────────────────

function extractAsin(url) {
  if (!url) return null;
  const match = url.match(/\/dp\/([A-Z0-9]{10})/);
  return match ? match[1] : null;
}

function extractFlipkartPid(url) {
  if (!url) return null;
  const match = url.match(/\/p\/itm([A-Za-z0-9]+)/i);
  return match ? match[1] : null;
}

function extractModelNumber(title) {
  if (!title) return null;
  const matches = title.match(/\b([A-Z0-9]{2,4}[-][A-Z0-9]{2,8}(?:[-][A-Z0-9]{1,6})?)\b/g);
  if (!matches || matches.length === 0) return null;
  // Return the longest match (most likely to be the actual model number)
  return matches.reduce((a, b) => (a.length >= b.length ? a : b));
}

function extractEan(title) {
  if (!title) return null;
  const match = title.match(/\b(\d{8}|\d{12}|\d{13})\b/);
  return match ? match[1] : null;
}

function extractIsbn(title) {
  if (!title) return null;
  const match = title.match(/\b(97[89]\d{10}|\d{9}[\dX])\b/);
  return match ? match[1] : null;
}

function extractMyntraStyleId(url) {
  if (!url) return null;
  const match = url.match(/\/buy\/[^/]+\/(\d+)/);
  return match ? match[1] : null;
}

function extractAjioCode(url) {
  if (!url) return null;
  const match = url.match(/\/p\/([A-Za-z0-9\-]+?)(?:\?|$)/);
  return match ? match[1] : null;
}

module.exports = { resolve };
