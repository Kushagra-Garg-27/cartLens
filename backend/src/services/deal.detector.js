const db = require("../db");
const { formatINR } = require("../utils/format");

/**
 * Deal Detection Engine.
 * Computes deal tags, deal scores, price stats, and buy recommendations.
 */

// ── Deal Tags (per-listing) ──────────────────────────────

/**
 * Compute deal tags for a single listing.
 * @param {Object} listing - The listing to evaluate
 * @param {Object[]} allListings - All priced listings for comparison
 * @returns {Promise<string[]>}
 */
async function computeTags(listing, allListings) {
  const tags = [];
  const prices = allListings
    .filter((l) => l.price != null)
    .map((l) => l.price)
    .sort((a, b) => a - b);

  if (prices.length === 0) return tags;

  const lowestPrice = prices[0];
  const secondLowest = prices.length > 1 ? prices[1] : null;

  if (listing.price === lowestPrice && secondLowest !== null) {
    const gapPercent = ((secondLowest - lowestPrice) / secondLowest) * 100;
    if (gapPercent >= 5) tags.push("BEST DEAL");
  }

  if (listing.price === lowestPrice && listing.last_scraped_at) {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    if (new Date(listing.last_scraped_at) >= fourHoursAgo) {
      tags.push("LOWEST TODAY");
    }
  }

  if (listing.price_history && listing.price_history.length > 0) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentHistory = listing.price_history.filter(
      (h) => new Date(h.scraped_at) >= sevenDaysAgo
    );
    if (recentHistory.length > 1) {
      const avgPrice =
        recentHistory.reduce((sum, h) => sum + parseFloat(h.price), 0) /
        recentHistory.length;
      if (listing.price < avgPrice) tags.push("PRICE DROP");
    }
  }

  if (listing.price_history && listing.price_history.length > 0) {
    const allTimeLow = Math.min(
      ...listing.price_history.map((h) => parseFloat(h.price))
    );
    if (listing.price <= allTimeLow) tags.push("ALL TIME LOW");
  }

  return tags;
}

// ── Deal Score (product-level) ───────────────────────────

/**
 * Compute deal score (0–100) with 6-factor breakup.
 * @param {string} productId
 * @param {number} currentPrice
 * @param {boolean} isLowestAcrossStores
 * @returns {Promise<{ score: number, breakup: Array, badge: string, context_tag: Object }>}
 */
async function computeDealScore(productId, currentPrice, isLowestAcrossStores = false) {
  const history = await getAllPriceHistory(productId);
  const breakup = [];
  let score = 0;

  if (history.length === 0) {
    return {
      score: 50,
      breakup: [
        { label: "Insufficient price history", pts: 0, earned: false },
      ],
      badge: "Fair",
      context_tag: { label: "New Product", detail: "Not enough data to assess this deal yet" },
    };
  }

  const prices = history.map((h) => parseFloat(h.price));
  const allTimeLow = Math.min(...prices);

  // Factor 1: At all-time low price (+30 pts)
  if (currentPrice <= allTimeLow) {
    score += 30;
    breakup.push({ label: `At All time low price (${formatINR(allTimeLow)})`, pts: 30, earned: true });
  } else {
    breakup.push({ label: `Above All time low price (${formatINR(allTimeLow)})`, pts: 30, earned: false });
  }

  // Factor 2: At or below 6-month low (+25 pts)
  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const sixMonthPrices = history
    .filter((h) => new Date(h.scraped_at) >= sixMonthsAgo)
    .map((h) => parseFloat(h.price));
  const sixMonthLow = sixMonthPrices.length > 0 ? Math.min(...sixMonthPrices) : allTimeLow;
  if (currentPrice <= sixMonthLow) {
    score += 25;
    breakup.push({ label: `At or below 6 months low price (${formatINR(sixMonthLow)})`, pts: 25, earned: true });
  } else {
    breakup.push({ label: `Above 6 months low price (${formatINR(sixMonthLow)})`, pts: 25, earned: false });
  }

  // Factor 3: No price hike before sale (+20 pts)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentPrices = history
    .filter((h) => new Date(h.scraped_at) >= sevenDaysAgo)
    .map((h) => parseFloat(h.price))
    .sort((a, b) => a - b);
  const hadPriceHike = recentPrices.length >= 2 &&
    recentPrices[recentPrices.length - 1] > recentPrices[0] * 1.02;
  if (!hadPriceHike) {
    score += 20;
    breakup.push({ label: "No Price hike before sale", pts: 20, earned: true });
  } else {
    breakup.push({ label: "Price hike detected before sale", pts: 20, earned: false });
  }

  // Factor 4: Lowest available across stores (+10 pts)
  if (isLowestAcrossStores) {
    score += 10;
    breakup.push({ label: "Lowest available across stores", pts: 10, earned: true });
  } else {
    breakup.push({ label: "Not the lowest across stores", pts: 10, earned: false });
  }

  // Factor 5: No active sale event (-10 pts penalty)
  const saleEventName = detectActiveSaleEvent();
  if (saleEventName) {
    breakup.push({ label: `Active sale event (${saleEventName})`, pts: 0, earned: true });
  } else {
    score -= 10;
    breakup.push({ label: "No active sale event", pts: -10, earned: true });
  }

  // Factor 6: Price at or above average (-15 pts penalty)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const ninetyDayPrices = history
    .filter((h) => new Date(h.scraped_at) >= ninetyDaysAgo)
    .map((h) => parseFloat(h.price));
  const avg90d = ninetyDayPrices.length > 0
    ? ninetyDayPrices.reduce((s, p) => s + p, 0) / ninetyDayPrices.length
    : currentPrice;
  if (currentPrice >= avg90d) {
    score -= 15;
    breakup.push({ label: `At or above average price (${formatINR(Math.round(avg90d))})`, pts: -15, earned: true });
  } else {
    breakup.push({ label: `Below average price (${formatINR(Math.round(avg90d))})`, pts: 0, earned: true });
  }

  // Cap score
  score = Math.max(0, Math.min(100, score));

  // Badge
  let badge;
  if (score >= 81) badge = "Excellent";
  else if (score >= 61) badge = "Great";
  else if (score >= 41) badge = "Good";
  else if (score >= 21) badge = "Fair";
  else badge = "Poor";

  // Context tag
  let context_tag;
  if (currentPrice <= allTimeLow) {
    context_tag = { label: "At Historic Low", detail: "Lowest price ever recorded" };
  } else if (saleEventName) {
    context_tag = { label: saleEventName, detail: "Special sale event pricing" };
  } else if (hadPriceHike) {
    context_tag = { label: "Price Inflated", detail: "Price rose before this sale" };
  } else {
    context_tag = { label: "Stable Pricing", detail: "Price has been consistent" };
  }

  return { score, breakup, badge, context_tag };
}

// ── Price Stats (product-level) ──────────────────────────

/**
 * Compute aggregate price statistics from all price_history for a product.
 * @param {string} productId
 * @returns {Promise<Object>}
 */
async function computePriceStats(productId) {
  const history = await getAllPriceHistory(productId);

  if (history.length === 0) {
    return {
      all_time_high: null,
      all_time_low: null,
      avg_price_90d: null,
      last_sale_price: null,
      last_sale_date: null,
    };
  }

  const prices = history.map((h) => parseFloat(h.price));
  const allTimeHigh = Math.max(...prices);
  const allTimeLow = Math.min(...prices);

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const recent = history
    .filter((h) => new Date(h.scraped_at) >= ninetyDaysAgo)
    .map((h) => parseFloat(h.price));
  const avg90d = recent.length > 0
    ? Math.round(recent.reduce((s, p) => s + p, 0) / recent.length)
    : Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);

  const saleEvent = detectLastSaleEvent(history);

  return {
    all_time_high: allTimeHigh,
    all_time_low: allTimeLow,
    avg_price_90d: avg90d,
    last_sale_price: saleEvent ? saleEvent.price : null,
    last_sale_date: saleEvent ? saleEvent.date : null,
  };
}

// ── Buy Recommendation ───────────────────────────────────

/**
 * Compute buy timing recommendation score.
 * @param {string} productId
 * @param {number} currentPrice
 * @returns {Promise<Object>}
 */
async function computeBuyRecommendation(productId, currentPrice) {
  const history = await getAllPriceHistory(productId);

  if (history.length < 2) {
    return {
      score: 50,
      label: "Insufficient data",
      reason: "Not enough price history to analyze trends",
      score_1week: 50,
      score_1month: 50,
    };
  }

  const prices = history.map((h) => parseFloat(h.price));
  const allTimeLow = Math.min(...prices);

  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const sixMonthPrices = history
    .filter((h) => new Date(h.scraped_at) >= sixMonthsAgo)
    .map((h) => parseFloat(h.price));
  const sixMonthAvg = sixMonthPrices.length > 0
    ? sixMonthPrices.reduce((s, p) => s + p, 0) / sixMonthPrices.length
    : prices.reduce((s, p) => s + p, 0) / prices.length;

  let score = 50;
  let reason = "Price is stable";

  // Near all-time low (within 3%)
  if (currentPrice <= allTimeLow * 1.03) {
    score = 90;
    reason = "Price is at or near all-time low";
  }
  // Below 6-month avg by >10%
  else if (currentPrice < sixMonthAvg * 0.9) {
    score = 75;
    reason = "Price is significantly below average";
  }
  // At 6-month avg ±5%
  else if (currentPrice >= sixMonthAvg * 0.95 && currentPrice <= sixMonthAvg * 1.05) {
    score = 50;
    reason = "Price is at average level";
  }
  // Above 6-month avg by >10%
  else if (currentPrice > sixMonthAvg * 1.1) {
    score = 25;
    reason = "Price is above average — consider waiting";
  }

  // Recent price rise penalty
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const recentPrices = history
    .filter((h) => new Date(h.scraped_at) >= fourteenDaysAgo)
    .map((h) => parseFloat(h.price));
  if (recentPrices.length >= 2) {
    const oldestRecent = recentPrices[recentPrices.length - 1];
    if (currentPrice > oldestRecent * 1.03) {
      score = Math.max(0, score - 15);
      reason = "Price rose recently — may drop again";
    }
  }

  score = Math.max(0, Math.min(100, score));

  let label;
  if (score >= 75) label = "It's a great time to buy";
  else if (score >= 50) label = "It's a good time to buy";
  else if (score >= 25) label = "Consider waiting";
  else label = "Wait for a better price";

  // Deterministic timeframe variants (e.g., trend based on recent momentum)
  let score1w = score;
  let score1m = score;
  
  if (currentPrice > sixMonthAvg) {
    // If currently high, likely to drop over time
    score1w = Math.min(100, score + 10);
    score1m = Math.min(100, score + 20);
  } else if (currentPrice <= allTimeLow * 1.03) {
    // If currently low, likely to rise
    score1w = Math.max(0, score - 15);
    score1m = Math.max(0, score - 30);
  }

  return { score, label, reason, score_1week: score1w, score_1month: score1m };
}

// ── Sale Event Detection ─────────────────────────────────

/**
 * Detect the last sale event (largest single-day drop in price).
 * @param {{ price: number|string, scraped_at: string }[]} historyRows
 * @returns {{ price: number, date: string } | null}
 */
function detectLastSaleEvent(historyRows) {
  if (!historyRows || historyRows.length < 2) return null;

  // Sort chronologically ascending
  const sorted = [...historyRows].sort(
    (a, b) => new Date(a.scraped_at) - new Date(b.scraped_at)
  );

  let maxDrop = 0;
  let salePrice = null;
  let saleDate = null;

  for (let i = 1; i < sorted.length; i++) {
    const prev = parseFloat(sorted[i - 1].price);
    const curr = parseFloat(sorted[i].price);
    const drop = prev - curr;
    if (drop > maxDrop) {
      maxDrop = drop;
      salePrice = curr;
      saleDate = sorted[i].scraped_at;
    }
  }

  if (salePrice === null || maxDrop <= 0) return null;
  return { price: salePrice, date: saleDate };
}

/**
 * Detect if there is a known active sale event based on current date.
 * @returns {string | null}
 */
function detectActiveSaleEvent() {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const date = now.getDate();
  
  // Basic heuristics for Indian sales
  if (month === 0 && date >= 15 && date <= 26) return "Republic Day Sale";
  if (month === 7 && date >= 8 && date <= 15) return "Independence Day Sale";
  if (month === 9 && date >= 1 && date <= 31) return "Festive Season Sale"; // October
  if (month === 10 && date >= 1 && date <= 15) return "Diwali Sale"; // November
  
  return null;
}

// ── Daily Deduplicated Price History ─────────────────────

/**
 * Build a daily deduplicated price time series for chart rendering.
 * Uses lowest price per day across all listings.
 * @param {string} productId
 * @returns {Promise<Array<{ date: string, price: number }>>}
 */
async function buildDailyPriceHistory(productId) {
  const result = await db.query(
    `SELECT DATE(ph.scraped_at) AS day, MIN(ph.price) AS price
     FROM price_history ph
     JOIN listings l ON l.id = ph.listing_id
     WHERE l.product_id = $1
     GROUP BY DATE(ph.scraped_at)
     ORDER BY day ASC`,
    [productId]
  );

  return result.rows.map((r) => ({
    date: r.day.toISOString().split("T")[0],
    price: parseFloat(r.price),
  }));
}

// ── Internal Helpers ─────────────────────────────────────

/**
 * Fetch all price_history rows for a product across all listings.
 * @param {string} productId
 * @returns {Promise<Array>}
 */
async function getAllPriceHistory(productId) {
  const result = await db.query(
    `SELECT ph.price, ph.scraped_at
     FROM price_history ph
     JOIN listings l ON l.id = ph.listing_id
     WHERE l.product_id = $1
     ORDER BY ph.scraped_at ASC`,
    [productId]
  );
  return result.rows;
}

module.exports = {
  computeTags,
  computeDealScore,
  computePriceStats,
  computeBuyRecommendation,
  detectLastSaleEvent,
  detectActiveSaleEvent,
  buildDailyPriceHistory,
};
