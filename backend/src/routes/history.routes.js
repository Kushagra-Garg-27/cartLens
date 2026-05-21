const express = require("express");
const router = express.Router();
const db = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const dealDetector = require("../services/deal.detector");
const logger = require("../utils/logger");

// GET /api/history/:product_id
router.get("/:product_id", authMiddleware, async (req, res) => {
  try {
    const { product_id } = req.params;
    const days = parseInt(req.query.days, 10) || 90;

    // Verify product exists
    const productCheck = await db.query(
      "SELECT id, canonical_name, brand FROM products WHERE id = $1",
      [product_id]
    );
    if (productCheck.rows.length === 0) {
      return res.status(404).json({
        error: "Product not found",
        code: "NOT_FOUND",
      });
    }

    const product = productCheck.rows[0];

    // Get all price history grouped by platform
    const result = await db.query(
      `SELECT
        l.platform,
        l.url,
        ph.price,
        ph.availability,
        ph.source,
        ph.scraped_at
      FROM price_history ph
      JOIN listings l ON l.id = ph.listing_id
      WHERE l.product_id = $1
      ORDER BY l.platform, ph.scraped_at DESC`,
      [product_id]
    );

    // Group by platform
    const platformMap = {};
    for (const row of result.rows) {
      if (!platformMap[row.platform]) {
        platformMap[row.platform] = {
          platform: row.platform,
          url: row.url,
          history: [],
        };
      }
      platformMap[row.platform].history.push({
        price: parseFloat(row.price),
        availability: row.availability,
        source: row.source,
        scraped_at: row.scraped_at,
      });
    }

    // Compute price trend per platform
    const platforms = Object.values(platformMap).map((p) => {
      const trend = computePriceTrend(p.history);
      return { ...p, price_trend: trend };
    });

    // Get daily deduplicated price history (for chart)
    const priceHistory = await dealDetector.buildDailyPriceHistory(product_id);

    // Get platform price history
    const platformPriceHistory = await dealDetector.buildPlatformPriceHistory(product_id, days);

    // Get aggregate price stats
    const priceStats = await dealDetector.computePriceStats(product_id);

    res.json({
      product_id,
      product_name: product.canonical_name,
      brand: product.brand,
      platforms,
      price_history: priceHistory,
      platform_price_history: platformPriceHistory,
      price_stats: priceStats,
    });
  } catch (err) {
    logger.error({
      service: "api",
      event: "history_error",
      error: err.message,
    });
    res.status(500).json({ error: "Internal error", code: "SERVER_ERROR" });
  }
});

/**
 * Compute price trend from history entries (already sorted DESC by scraped_at).
 * @param {{ price: number }[]} history
 * @returns {"rising"|"falling"|"stable"}
 */
function computePriceTrend(history) {
  if (history.length < 2) return "stable";

  const recent = history.slice(0, Math.min(3, history.length));
  const newest = recent[0].price;
  const oldest = recent[recent.length - 1].price;

  const changePercent = ((newest - oldest) / oldest) * 100;
  if (changePercent > 2) return "rising";
  if (changePercent < -2) return "falling";
  return "stable";
}

module.exports = router;
