/**
 * Personalized Platform Ranker Service
 *
 * Records user click choices and computes a TF-IDF-inspired affinity score
 * per (user, platform, category) tuple using exponential temporal decay.
 * Adjusts ranking weights based on user price sensitivity profiles.
 */
const db = require("../db");
const logger = require("../utils/logger");

// ─── Affinity score formula ────────────────────────────────

/**
 * TF-IDF-inspired affinity score.
 *
 * @param {number} clickCount        Decayed click count on this platform
 * @param {number} preferredOverCheaper  Decayed times chosen despite a cheaper option
 * @param {number} avgPremiumAccepted    Average % premium the user paid
 * @returns {number} Score in the range [0.5, 1.0]
 */
function computeAffinityScore(clickCount, preferredOverCheaper, avgPremiumAccepted) {
  // Not enough data — stay neutral
  if (clickCount < 0.5) return 0.5;

  const tf = preferredOverCheaper / Math.max(clickCount, 0.1);

  // Cap premium at 30% to avoid outlier distortion
  const cappedPremium = Math.min(Math.max(avgPremiumAccepted, 0), 30);
  const idf = 1 + Math.log(1 + cappedPremium / 100);

  // Map into 0.5–1.0 range
  const score = 0.5 + tf * idf * 0.5;

  return Math.min(score, 1.0);
}

/**
 * Compute decayed affinity statistics from raw click events.
 * Uses exponential temporal decay: weight = e^(-0.01 * daysAgo).
 *
 * @param {Array} clicks Array of click rows
 * @returns {Object} Map of platform -> affinityScore
 */
function computeDecayedAffinity(clicks) {
  const platformStats = {};
  for (const c of clicks) {
    const platform = c.chosen_platform;
    const daysAgo = parseFloat(c.days_ago) || 0;
    const weight = Math.exp(-0.01 * daysAgo); // half-life ≈ 69 days

    if (!platformStats[platform]) {
      platformStats[platform] = { clickCount: 0, preferredOverCheaper: 0, weightedPremium: 0 };
    }

    platformStats[platform].clickCount += weight;

    // Parse alternatives to find min price
    let alts = [];
    try {
      alts = typeof c.alternatives === 'string' ? JSON.parse(c.alternatives) : (c.alternatives || []);
    } catch (e) {}

    const prices = alts.map(a => a.price).filter(p => p != null && p > 0);
    if (c.chosen_price) prices.push(c.chosen_price);
    const minPrice = prices.length > 0 ? Math.min(...prices) : c.chosen_price;

    const wasPreferred = c.chosen_price && minPrice && c.chosen_price > minPrice ? 1 : 0;
    const premium = c.chosen_price && minPrice && minPrice > 0 ? ((c.chosen_price - minPrice) / minPrice) * 100 : 0;

    platformStats[platform].preferredOverCheaper += weight * wasPreferred;
    platformStats[platform].weightedPremium += weight * premium;
  }

  const scores = {};
  for (const platform in platformStats) {
    const stats = platformStats[platform];
    const avgPremium = stats.clickCount > 0 ? stats.weightedPremium / stats.clickCount : 0;
    scores[platform] = computeAffinityScore(stats.clickCount, stats.preferredOverCheaper, avgPremium);
  }
  return scores;
}

// ─── Record a click ────────────────────────────────────────

/**
 * Record that a user clicked a particular platform link, then
 * update the user price profile and recompute category & global affinities.
 *
 * @param {string}   userId
 * @param {string}   productId
 * @param {string}   chosenPlatform
 * @param {number}   chosenPrice
 * @param {{ platform: string, price: number }[]} allResults
 * @param {string}   [category]
 */
async function recordClick(userId, productId, chosenPlatform, chosenPrice, allResults, category) {
  // If category is not provided, fetch it from product
  let targetCategory = category;
  if (!targetCategory) {
    const productCheck = await db.query("SELECT category FROM products WHERE id = $1", [productId]);
    targetCategory = productCheck.rows[0]?.category || "general";
  }

  // Build alternatives array (everything except the chosen platform)
  const alternatives = (allResults || [])
    .filter((r) => r.platform !== chosenPlatform)
    .map((r) => ({ platform: r.platform, price: r.price }));

  // 1. Insert raw click
  await db.query(
    `INSERT INTO user_platform_clicks
       (user_id, product_id, chosen_platform, chosen_price, alternatives, category)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, productId, chosenPlatform, chosenPrice || null, JSON.stringify(alternatives), targetCategory]
  );

  // 2. Update price profile
  const prices = (allResults || [])
    .filter((r) => r.price != null && r.price > 0)
    .map((r) => r.price);

  const minPrice = prices.length > 0 ? Math.min(...prices) : chosenPrice;
  const isCheapest = chosenPrice && minPrice && chosenPrice <= minPrice ? 1 : 0;
  const hasAlternatives = prices.length > 1 ? 1 : 0;

  if (hasAlternatives) {
    await db.query(
      `INSERT INTO user_profiles (user_id, total_comparisons, cheapest_chosen, preferred_category, last_computed_at)
       VALUES ($1, 1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         total_comparisons = user_profiles.total_comparisons + 1,
         cheapest_chosen = user_profiles.cheapest_chosen + $2,
         price_sensitivity = (user_profiles.cheapest_chosen + $2)::float / (user_profiles.total_comparisons + 1),
         preferred_category = COALESCE($3, user_profiles.preferred_category),
         last_computed_at = NOW()`,
      [userId, isCheapest, targetCategory]
    );
  }

  // 3. Recompute expired click affinities (with decay)
  const clickQuery = await db.query(
    `SELECT chosen_platform, chosen_price, alternatives, category,
            EXTRACT(EPOCH FROM (NOW() - clicked_at)) / 86400 AS days_ago
     FROM user_platform_clicks
     WHERE user_id = $1`,
    [userId]
  );

  const categoryScores = computeDecayedAffinity(clickQuery.rows.filter(c => c.category === targetCategory));
  const globalScores = computeDecayedAffinity(clickQuery.rows);

  // Upsert category specific scores
  for (const [platform, score] of Object.entries(categoryScores)) {
    await db.query(
      `INSERT INTO user_platform_affinity (user_id, platform, category, affinity_score, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, platform, category) DO UPDATE SET
         affinity_score = EXCLUDED.affinity_score,
         updated_at = NOW()`,
      [userId, platform, targetCategory, score]
    );
  }

  // Upsert global category scores
  for (const [platform, score] of Object.entries(globalScores)) {
    await db.query(
      `INSERT INTO user_platform_affinity (user_id, platform, category, affinity_score, updated_at)
       VALUES ($1, $2, 'global', $3, NOW())
       ON CONFLICT (user_id, platform, category) DO UPDATE SET
         affinity_score = EXCLUDED.affinity_score,
         updated_at = NOW()`,
      [userId, platform, score]
    );
  }

  logger.info({
    service: "ranker",
    event: "click_recorded_decayed",
    user_id: userId.substring(0, 8),
    platform: chosenPlatform,
    category: targetCategory,
  });
}

// ─── Rank results ──────────────────────────────────────────

/**
 * Re-rank comparison results using the user's platform affinity.
 *
 * @param {string} userId
 * @param {{ platform: string, price: number }[]} results
 * @param {string} [category]
 * @returns {Promise<object[]>} Sorted results with `personalizedRank` + `affinityBoost` fields
 */
async function rankResults(userId, results, category = "general") {
  if (!results || results.length === 0) return results;

  const platforms = [...new Set(results.map((r) => r.platform).filter(Boolean))];
  if (platforms.length === 0) return results;

  // 1. Fetch affinity scores for this category and global
  const placeholders = platforms.map((_, i) => `$${i + 3}`).join(", ");
  const affinityResult = await db.query(
    `SELECT platform, category, affinity_score
       FROM user_platform_affinity
      WHERE user_id = $1
        AND category IN ($2, 'global')
        AND platform IN (${placeholders})`,
    [userId, category, ...platforms]
  );

  // Map platform -> { categoryScore, globalScore }
  const affinityMap = {};
  for (const row of affinityResult.rows) {
    if (!affinityMap[row.platform]) {
      affinityMap[row.platform] = { category: 0.5, global: 0.5 };
    }
    if (row.category === category) {
      affinityMap[row.platform].category = parseFloat(row.affinity_score);
    } else {
      affinityMap[row.platform].global = parseFloat(row.affinity_score);
    }
  }

  // 2. Fetch platform health parameters
  const healthPlaceholders = platforms.map((_, i) => `$${i + 1}`).join(", ");
  const healthResult = await db.query(
    `SELECT platform, success_rate
       FROM platform_health
      WHERE platform IN (${healthPlaceholders})`,
    platforms
  );

  const healthMap = {};
  for (const row of healthResult.rows) {
    healthMap[row.platform] = parseFloat(row.success_rate);
  }

  // 3. Fetch user price sensitivity profile
  const profileResult = await db.query(
    "SELECT price_sensitivity FROM user_profiles WHERE user_id = $1",
    [userId]
  );
  const priceSensitivity = profileResult.rows.length > 0 ? parseFloat(profileResult.rows[0].price_sensitivity) : 0.5;

  const hasPersonalData = Object.values(affinityMap).some((s) => s.category !== 0.5 || s.global !== 0.5);

  const prices = results.filter((r) => r.price != null && r.price > 0).map((r) => r.price);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 1;

  // 4. Score and sort
  const scored = results.map((r) => {
    // Prefer category-specific affinity, fallback to global
    const platformAffinity = affinityMap[r.platform];
    const affinity = platformAffinity 
      ? (platformAffinity.category !== 0.5 ? platformAffinity.category : platformAffinity.global)
      : 0.5;

    const normalizedPrice = r.price && r.price > 0 ? r.price / minPrice : 999;

    // Apply price sensitivity weight adjustment
    // High sensitivity (e.g. 1.0) exaggerates price differences: Math.pow(normalizedPrice, 2.0)
    // Low sensitivity (e.g. 0.0) nullifies price differences: Math.pow(normalizedPrice, 0.0) = 1
    const priceExponent = 1.0 + (priceSensitivity - 0.5) * 2.0;
    const priceComponent = Math.pow(1 / normalizedPrice, Math.max(0, priceExponent));

    // Freshness score
    const hours = r.last_scraped_at ? (Date.now() - new Date(r.last_scraped_at).getTime()) / 3600000 : 999;
    let freshnessScore = 1.0;
    if (hours > 24) {
      freshnessScore = 0.7;
    } else if (hours > 2) {
      freshnessScore = 0.9;
    }

    const confidenceScore = r.match_confidence != null ? parseFloat(r.match_confidence) : 0.8;
    const successRate = healthMap[r.platform] != null ? healthMap[r.platform] : 1.0;
    const reliabilityWeight = 0.85 + (successRate * 0.15);

    const rankScore = priceComponent * affinity * freshnessScore * confidenceScore * reliabilityWeight;

    return {
      ...r,
      personalizedRank: hasPersonalData,
      affinityBoost: affinity,
      _rankScore: rankScore,
    };
  });

  scored.sort((a, b) => b._rankScore - a._rankScore);

  return scored.map(({ _rankScore, ...rest }) => rest);
}

module.exports = {
  computeAffinityScore,
  recordClick,
  rankResults,
};

