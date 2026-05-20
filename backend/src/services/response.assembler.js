const db = require("../db");
const dealDetector = require("./deal.detector");
const { calculateSavings } = require("../utils/format");

/**
 * Assemble the full comparison response with intelligence data.
 * @param {string} productId
 * @param {Array} listings - From listing.fetcher
 * @param {string} userId
 * @returns {Promise<Object>}
 */
async function assemble(productId, listings, userId) {
  // Filter to listings that have a price
  const priced = listings.filter((l) => l.price != null);

  // Compute deal tags for each listing
  const results = await Promise.all(
    priced.map(async (listing) => {
      const dealTags = await dealDetector.computeTags(listing, priced);
      return {
        platform: listing.platform,
        price: listing.price,
        currency: listing.currency,
        availability: listing.availability,
        url: listing.url,
        match_confidence: listing.match_confidence,
        match_method: listing.match_method,
        last_scraped_at: listing.last_scraped_at,
        deal_tags: dealTags,
        price_history: listing.price_history,
      };
    })
  );

  // Sort by in_stock first, then price ascending
  results.sort((a, b) => {
    const aStock = a.availability === "in_stock" ? 1 : 0;
    const bStock = b.availability === "in_stock" ? 1 : 0;
    if (aStock !== bStock) return bStock - aStock; // in_stock comes first
    return a.price - b.price;
  });

  // Inject stale price logic
  results.forEach(r => {
    if (r.last_scraped_at) {
      const scrapedAt = new Date(r.last_scraped_at);
      const ageInHours = (Date.now() - scrapedAt.getTime()) / (1000 * 60 * 60);
      r.ageInHours = ageInHours;
      if (ageInHours > 48) {
        r.ageWarning = `Price is ${Math.floor(ageInHours / 24)} days old. Checking for updates...`;
      } else if (ageInHours > 24) {
        r.ageWarning = "Price is over 24 hours old.";
      } else {
        r.ageWarning = null;
      }
    }
  });

  // Compute best deal
  let bestDeal = null;
  if (results.length >= 1) {
    const bestPrice = results[0].price;
    const referencePrice = Math.max(...results.map((r) => r.price));
    const savings = calculateSavings(referencePrice, bestPrice);

    bestDeal = {
      platform: results[0].platform,
      price: bestPrice,
      savings_percent: savings.percent,
      savings_amount: savings.amount,
    };
  }

  // Check watchlist status + target price
  const watchlistCheck = await db.query(
    "SELECT id, target_price FROM watchlist WHERE user_id = $1 AND product_id = $2",
    [userId, productId]
  );
  const onWatchlist = watchlistCheck.rows.length > 0;
  const watchlistTargetPrice = onWatchlist && watchlistCheck.rows[0].target_price
    ? parseFloat(watchlistCheck.rows[0].target_price)
    : null;

  // Get current best price for scoring
  const currentPrice = results.length > 0 ? results[0].price : null;
  const isLowestAcrossStores = results.length > 1;

  // Compute deal score, price stats, buy recommendation, daily history
  let dealScore = { score: 50, breakup: [], badge: "Fair", context_tag: { label: "New Product", detail: "Not enough data yet" } };
  let priceStats = { all_time_high: null, all_time_low: null, avg_price_90d: null, last_sale_price: null, last_sale_date: null };
  let buyRecommendation = { score: 50, label: "Insufficient data", reason: "Not enough history", score_1week: 50, score_1month: 50 };
  let priceHistory = [];

  if (currentPrice != null) {
    const [ds, ps, br, ph] = await Promise.all([
      dealDetector.computeDealScore(productId, currentPrice, isLowestAcrossStores),
      dealDetector.computePriceStats(productId),
      dealDetector.computeBuyRecommendation(productId, currentPrice),
      dealDetector.buildDailyPriceHistory(productId),
    ]);
    dealScore = ds;
    priceStats = ps;
    buyRecommendation = br;
    priceHistory = ph;
  }

  return {
    results,
    best_deal: bestDeal,
    on_watchlist: onWatchlist,
    watchlist_target_price: watchlistTargetPrice,
    deal_score: dealScore.score,
    deal_score_breakup: dealScore.breakup,
    deal_badge: dealScore.badge,
    deal_context_tag: dealScore.context_tag,
    price_stats: priceStats,
    price_history: priceHistory,
    buy_recommendation: buyRecommendation,
  };
}

module.exports = { assemble };
