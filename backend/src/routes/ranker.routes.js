const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const ranker = require("../services/ranker.service");
const logger = require("../utils/logger");

const db = require("../db");

/**
 * POST /api/rank/click
 *
 * Body: {
 *   product_id:       UUID,
 *   chosen_platform:  string,
 *   chosen_price:     number,
 *   all_results:      [{ platform, price }],
 *   category:         string
 * }
 *
 * Records the user's platform choice and updates their affinity scores.
 */
router.post("/click", authMiddleware, async (req, res) => {
  try {
    const { product_id, chosen_platform, chosen_price, all_results, category } = req.body;

    if (!product_id || !chosen_platform) {
      return res.status(400).json({
        error: "product_id and chosen_platform are required",
        code: "VALIDATION_ERROR",
      });
    }

    await ranker.recordClick(
      req.userId,
      product_id,
      chosen_platform,
      chosen_price || null,
      all_results || [],
      category
    );

    res.json({ ok: true });
  } catch (err) {
    logger.error({
      service: "api",
      event: "rank_click_error",
      error: err.message,
      user_id: req.userId ? req.userId.substring(0, 8) : undefined,
    });
    res.status(500).json({ error: "Internal error", code: "SERVER_ERROR" });
  }
});

/**
 * GET /api/rank/profile
 *
 * Retrieves the user's price sensitivity profile and platform affinity metrics.
 */
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const profileRes = await db.query(
      "SELECT price_sensitivity, total_comparisons, cheapest_chosen, preferred_category FROM user_profiles WHERE user_id = $1",
      [req.userId]
    );

    const affinitiesRes = await db.query(
      "SELECT platform, category, affinity_score FROM user_platform_affinity WHERE user_id = $1 ORDER BY category, affinity_score DESC",
      [req.userId]
    );

    const profile = profileRes.rows[0] || {
      price_sensitivity: 0.5,
      total_comparisons: 0,
      cheapest_chosen: 0,
      preferred_category: null
    };

    res.json({
      profile,
      affinities: affinitiesRes.rows
    });
  } catch (err) {
    logger.error({
      service: "api",
      event: "rank_profile_error",
      error: err.message,
      user_id: req.userId ? req.userId.substring(0, 8) : undefined,
    });
    res.status(500).json({ error: "Internal error", code: "SERVER_ERROR" });
  }
});

module.exports = router;
