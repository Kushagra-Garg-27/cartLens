/**
 * SmartCompare Pro — Observe Routes
 *
 * Passive observation endpoint for the extension.
 * Every product page visit sends price data here to build the price database.
 * This endpoint NEVER fails loudly — always returns { ok: true }.
 * No authentication required.
 */

const express = require("express");
const router = express.Router();
const db = require("../db");
const logger = require("../utils/logger");
const { normalizePlatform } = require("../utils/platform.normalizer");

/**
 * POST /api/observe
 *
 * Fire-and-forget price observation from the extension.
 * Upserts listing by URL, inserts price_history with source='extension_passive'.
 * Computes image hash if imageUrl is provided.
 */
router.post("/", async (req, res) => {
  // Always return success — never block the extension
  res.json({ ok: true });

  try {
    const { platform: rawPlatform, url, title, price, currency, imageUrl } = req.body;

    // Validate minimum required fields
    if (!url || !rawPlatform) return;
    if (!price || isNaN(Number(price))) return;

    const platform = normalizePlatform(rawPlatform);

    const numericPrice = Number(price);

    // Upsert listing by URL
    const upsertResult = await db.query(
      `INSERT INTO listings (url, platform, current_price, currency, availability, last_scraped_at)
       VALUES ($1, $2, $3, $4, 'in_stock', NOW())
       ON CONFLICT (url) DO UPDATE SET
         current_price = EXCLUDED.current_price,
         last_scraped_at = NOW()
       RETURNING id`,
      [url, platform, numericPrice, currency || "INR"]
    );

    if (upsertResult.rows.length === 0) return;
    const listingId = upsertResult.rows[0].id;

    // Insert price_history row
    await db.query(
      "INSERT INTO price_history (listing_id, price, availability, source) VALUES ($1, $2, 'in_stock', 'extension_passive')",
      [listingId, numericPrice]
    );

    // Compute and store image hash if imageUrl provided
    if (imageUrl) {
      try {
        const { computeImageHash } = require("../utils/image.hasher");
        const hash = await computeImageHash(imageUrl);
        if (hash) {
          await db.query(
            "UPDATE listings SET image_hash = $1 WHERE id = $2 AND (image_hash IS NULL OR image_hash != $1)",
            [hash, listingId]
          );
        }
      } catch {
        // Image hash failures are non-critical — silently ignore
      }
    }

    logger.info({
      service: "observe",
      event: "observation_stored",
      platform,
      price: numericPrice,
    });
  } catch (err) {
    // Log error internally but never fail the response (already sent)
    logger.error({
      service: "observe",
      event: "observation_error",
      error: err.message,
    });
  }
});

module.exports = router;
