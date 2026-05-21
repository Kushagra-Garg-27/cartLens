const express = require("express");
const router = express.Router();
const db = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const jobEnqueuer = require("../services/job.enqueuer");
const logger = require("../utils/logger");

// POST /api/watchlist
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { product_id, target_price } = req.body;

    if (!product_id) {
      return res.status(400).json({
        error: "product_id is required",
        code: "VALIDATION_ERROR",
      });
    }

    // Verify product exists
    const productCheck = await db.query("SELECT id FROM products WHERE id = $1", [product_id]);
    if (productCheck.rows.length === 0) {
      return res.status(404).json({
        error: "Product not found",
        code: "NOT_FOUND",
      });
    }

    // Upsert watchlist entry
    const result = await db.query(
      `INSERT INTO watchlist (user_id, product_id, target_price)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET target_price = EXCLUDED.target_price
       RETURNING id, product_id, target_price, created_at`,
      [req.userId, product_id, target_price || null]
    );

    // Compute suggested target price
    const dealDetector = require("../services/deal.detector");
    const stats = await dealDetector.computePriceStats(product_id);
    let suggestedTarget = null;
    if (stats && stats.avg_price_90d) {
      suggestedTarget = Math.round(parseFloat(stats.avg_price_90d) * 0.85);
    } else {
      const minPriceRes = await db.query(
        "SELECT MIN(current_price) as price FROM listings WHERE product_id = $1 AND current_price IS NOT NULL",
        [product_id]
      );
      if (minPriceRes.rows.length > 0 && minPriceRes.rows[0].price) {
        suggestedTarget = Math.round(parseFloat(minPriceRes.rows[0].price) * 0.85);
      }
    }

    // Immediately enqueue priority=1 scrape jobs for this product
    await jobEnqueuer.enqueueForProduct(product_id, 1);

    logger.info({
      service: "api",
      event: "watchlist_added",
      user_id: req.userId.substring(0, 8),
      product_id: product_id.substring(0, 8),
    });

    res.status(201).json({
      ...result.rows[0],
      suggested_target_price: suggestedTarget
    });
  } catch (err) {
    logger.error({
      service: "api",
      event: "watchlist_add_error",
      error: err.message,
    });
    res.status(500).json({ error: "Internal error", code: "SERVER_ERROR" });
  }
});

// GET /api/watchlist
router.get("/", authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
        w.id, w.product_id, w.target_price, w.created_at,
        p.canonical_name, p.brand,
        (
          SELECT l.current_price
          FROM listings l
          WHERE l.product_id = w.product_id
          ORDER BY l.current_price ASC NULLS LAST
          LIMIT 1
        ) AS latest_price
      FROM watchlist w
      JOIN products p ON p.id = w.product_id
      WHERE w.user_id = $1
      ORDER BY w.created_at DESC`,
      [req.userId]
    );

    const entries = result.rows.map((row) => ({
      id: row.id,
      product_id: row.product_id,
      product_name: row.canonical_name,
      brand: row.brand,
      target_price: row.target_price ? parseFloat(row.target_price) : null,
      latest_price: row.latest_price ? parseFloat(row.latest_price) : null,
      at_or_below_target:
        row.target_price && row.latest_price
          ? parseFloat(row.latest_price) <= parseFloat(row.target_price)
          : false,
      created_at: row.created_at,
    }));

    res.json(entries);
  } catch (err) {
    logger.error({
      service: "api",
      event: "watchlist_list_error",
      error: err.message,
    });
    res.status(500).json({ error: "Internal error", code: "SERVER_ERROR" });
  }
});

// DELETE /api/watchlist/:product_id
router.delete("/:product_id", authMiddleware, async (req, res) => {
  try {
    const { product_id } = req.params;
    const result = await db.query(
      "DELETE FROM watchlist WHERE user_id = $1 AND product_id = $2 RETURNING id",
      [req.userId, product_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Watchlist entry not found",
        code: "NOT_FOUND",
      });
    }

    logger.info({
      service: "api",
      event: "watchlist_removed",
      user_id: req.userId.substring(0, 8),
      product_id: product_id.substring(0, 8),
    });

    res.json({ message: "Removed from watchlist" });
  } catch (err) {
    logger.error({
      service: "api",
      event: "watchlist_delete_error",
      error: err.message,
    });
    res.status(500).json({ error: "Internal error", code: "SERVER_ERROR" });
  }
});

module.exports = router;
