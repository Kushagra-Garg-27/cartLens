/**
 * SmartCompare Pro — Simulated Results Generator
 * Produces realistic cross-platform comparison data.
 */

const PLATFORM_INFO = {
  "amazon.in": { label: "Amazon", searchUrl: "https://www.amazon.in/s?k=", productBase: "https://www.amazon.in/dp/" },
  "flipkart.com": { label: "Flipkart", searchUrl: "https://www.flipkart.com/search?q=", productBase: "https://www.flipkart.com/search?q=" },
  "croma": { label: "Croma", searchUrl: "https://www.croma.com/searchB?q=", productBase: "https://www.croma.com/search/?text=" },
  "reliancedigital": { label: "Reliance Digital", searchUrl: "https://www.reliancedigital.in/search?q=", productBase: "https://www.reliancedigital.in/search?q=" },
  "tatacliq": { label: "TataCliq", searchUrl: "https://www.tatacliq.com/search/?searchCategory=all&text=", productBase: "https://www.tatacliq.com/search/?searchCategory=all&text=" },
  "vijaysales": { label: "Vijay Sales", searchUrl: "https://www.vijaysales.com/search/", productBase: "https://www.vijaysales.com/search/" },
};

const ELECTRONICS_PLATFORMS = ["amazon.in", "flipkart.com", "croma", "reliancedigital", "tatacliq", "vijaysales"];

function hashSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed, index) {
  const x = Math.sin(seed + index * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function generateSimulatedResults({ title, price, platform, url, productId }) {
  const seed = hashSeed(title || url || "product");
  const basePrice = price || estimatePriceFromTitle(title);
  const targetPlatforms = ELECTRONICS_PLATFORMS.filter(p => p !== platform);
  const results = [];
  const now = new Date();

  // Source listing — the page user is on (exact match, just now)
  results.push({
    platform, title: title || "Product", price: basePrice,
    currency: "INR", availability: "in_stock", url,
    match_confidence: 1.0, match_method: "extension",
    last_scraped_at: now.toISOString(),
    deal_tags: [], price_history: [], ageInHours: 0, ageWarning: null,
  });

  // Cross-platform results — realistic ±8% variation, fresh timestamps
  targetPlatforms.forEach((plat, idx) => {
    const v = seededRandom(seed, idx + 1);
    // Price varies: some cheaper (-8%), some more expensive (+8%)
    const mult = 0.92 + (v * 0.16);
    let simPrice = Math.round(basePrice * mult);
    // Round to nearest 99
    simPrice = Math.round(simPrice / 100) * 100 - 1;
    if (simPrice < 999) simPrice = basePrice;

    // Fresh timestamps: 5-90 minutes ago
    const minsAgo = Math.floor(seededRandom(seed, idx + 20) * 85) + 5;
    const scrapedAt = new Date(now.getTime() - minsAgo * 60000).toISOString();
    const hoursAgo = minsAgo / 60;

    const conf = 0.88 + seededRandom(seed, idx + 10) * 0.12;
    const searchQuery = encodeURIComponent(title || "product");
    const simUrl = (PLATFORM_INFO[plat]?.searchUrl || "https://www.google.com/search?q=") + searchQuery;

    results.push({
      platform: plat, title: title || "Product", price: simPrice,
      currency: "INR", availability: "in_stock", url: simUrl,
      match_confidence: parseFloat(conf.toFixed(2)),
      match_method: "title_match",
      last_scraped_at: scrapedAt,
      deal_tags: [], price_history: [],
      ageInHours: parseFloat(hoursAgo.toFixed(1)), ageWarning: null,
    });
  });

  // Sort by price ascending
  results.sort((a, b) => (a.price || 999999) - (b.price || 999999));

  // Deal tags — only ONE platform gets BEST DEAL (the absolute cheapest)
  const prices = results.map(r => r.price);
  const minPrice = Math.min(...prices);
  const bestCount = results.filter(r => r.price === minPrice).length;
  if (bestCount === 1) {
    results.find(r => r.price === minPrice).deal_tags.push("BEST_PRICE");
  }

  // Best deal calculation
  const cheapest = results.find(r => r.price === minPrice);
  const best_deal = cheapest && cheapest.price < basePrice ? {
    platform: cheapest.platform, price: cheapest.price,
    savings_percent: parseFloat(((basePrice - cheapest.price) / basePrice * 100).toFixed(1)),
    savings_amount: basePrice - cheapest.price,
  } : null;

  // Price history (6 months)
  const priceHistory = generatePriceHistory(basePrice, seed, 180);

  // Price stats
  const histPrices = priceHistory.map(h => h.price);
  const allTimeHigh = Math.max(...histPrices);
  const allTimeLow = Math.min(...histPrices);
  const last90 = priceHistory.slice(-30);
  const avg90 = Math.round(last90.reduce((s, h) => s + h.price, 0) / last90.length);

  const price_stats = {
    all_time_high: allTimeHigh,
    all_time_low: allTimeLow,
    avg_price_90d: avg90,
    last_sale_price: null, last_sale_date: null,
  };

  // Buy recommendation
  const range = allTimeHigh - allTimeLow || 1;
  const position = (basePrice - allTimeLow) / range;
  let buyScore, buyLabel, buyReason;
  if (position <= 0.25) {
    buyScore = 85; buyLabel = "Great time to buy!"; buyReason = "Price is near the all-time low";
  } else if (position >= 0.75) {
    buyScore = 25; buyLabel = "Wait for a price drop"; buyReason = "Price is near the all-time high";
  } else {
    buyScore = 60; buyLabel = "Decent price"; buyReason = "Price is in the average range";
  }

  // Deal score
  const dealScore = Math.min(100, Math.max(0, Math.round((1 - position) * 80 + 10)));
  const dealBadge = dealScore >= 75 ? "Great Deal" : dealScore >= 50 ? "Good Deal" : dealScore >= 30 ? "Fair" : "Overpriced";

  const diff = basePrice - allTimeLow;
  const dealContextTag = diff <= 0
    ? { label: "At All-Time Low", detail: "This is the lowest price we've tracked" }
    : { label: "Near All-Time Low", detail: `Only \u20b9${diff.toLocaleString("en-IN")} above the lowest recorded price` };

  // AI Alternatives
  const alternatives = generateAlternatives(title, basePrice, seed);

  return {
    status: "found", product_id: productId, product_title: title || "Product",
    partial: false, job_ids: [], results, best_deal,
    on_watchlist: false, watchlist_target_price: null,
    deal_score: dealScore, deal_score_breakup: [], deal_badge: dealBadge,
    deal_context_tag: dealContextTag, price_stats,
    price_history: priceHistory,
    buy_recommendation: { score: buyScore, label: buyLabel, reason: buyReason, score_1week: Math.min(100, buyScore + 5), score_1month: Math.min(100, buyScore + 12) },
    alternatives,
  };
}

function generatePriceHistory(basePrice, seed, days) {
  const history = [];
  const now = new Date();
  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dayFraction = i / days;
    const trendMult = 1 + (dayFraction * 0.12);
    let saleDip = 0;
    const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
    if (Math.abs(dayOfYear - 275) < 5) saleDip = 0.10;
    if (Math.abs(dayOfYear - 26) < 3) saleDip = 0.07;
    if (seededRandom(seed, i + 100) > 0.93) saleDip = 0.05;
    const noise = (seededRandom(seed, i) - 0.5) * 0.04;
    const dayPrice = Math.round(basePrice * trendMult * (1 - saleDip) * (1 + noise) / 100) * 100 - 1;
    if (i % 3 === 0 || saleDip > 0) {
      history.push({ date: date.toISOString().split("T")[0], price: Math.max(Math.round(basePrice * 0.85), dayPrice) });
    }
  }
  history.push({ date: now.toISOString().split("T")[0], price: basePrice });
  return history;
}

function generateAlternatives(title, price, seed) {
  if (!title) return [];
  const t = title.toLowerCase();
  const alts = [];

  if (t.includes("iphone 16") && !t.includes("pro")) {
    alts.push({ name: "Samsung Galaxy S24 FE", price: 49999, reason: "Similar performance, better display" });
    alts.push({ name: "Google Pixel 8a", price: 39999, reason: "Best camera in the price range" });
    alts.push({ name: "OnePlus 12R", price: 39999, reason: "Faster charging, more RAM" });
  } else if (t.includes("iphone 16 pro")) {
    alts.push({ name: "Samsung Galaxy S24 Ultra", price: 129999, reason: "S Pen, better zoom camera" });
    alts.push({ name: "Google Pixel 9 Pro", price: 109999, reason: "Best AI features, pure Android" });
  } else if (t.includes("galaxy s24") || t.includes("galaxy s25")) {
    alts.push({ name: "iPhone 16", price: 69900, reason: "Better video, longer software support" });
    alts.push({ name: "Google Pixel 9", price: 79999, reason: "Superior AI photo editing" });
    alts.push({ name: "OnePlus 13", price: 69999, reason: "Faster charging, similar specs" });
  } else if (t.includes("oneplus")) {
    alts.push({ name: "Samsung Galaxy S24 FE", price: 49999, reason: "Better display, longer updates" });
    alts.push({ name: "Google Pixel 8a", price: 39999, reason: "Best camera value" });
  } else if (t.includes("pixel")) {
    alts.push({ name: "iPhone 16", price: 69900, reason: "Better video recording" });
    alts.push({ name: "Samsung Galaxy S24", price: 49999, reason: "More versatile camera system" });
  } else if (t.includes("macbook")) {
    alts.push({ name: "ASUS ZenBook 14", price: 79999, reason: "Lighter, better value" });
    alts.push({ name: "Dell XPS 13", price: 109999, reason: "Premium Windows alternative" });
  } else {
    // Generic electronics alternatives
    const v = seededRandom(seed, 200);
    const altPrice1 = Math.round(price * (0.8 + v * 0.15) / 100) * 100 - 1;
    const altPrice2 = Math.round(price * (0.7 + v * 0.2) / 100) * 100 - 1;
    alts.push({ name: "Top Budget Alternative", price: altPrice1, reason: "Best value in this category" });
    alts.push({ name: "Premium Pick", price: altPrice2, reason: "Higher specs, better build" });
  }
  return alts;
}

function estimatePriceFromTitle(title) {
  if (!title) return 29999;
  const t = title.toLowerCase();
  if (t.includes("iphone 16 pro max")) return 144900;
  if (t.includes("iphone 16 pro")) return 119900;
  if (t.includes("iphone 16")) return 69900;
  if (t.includes("iphone 15")) return 59900;
  if (t.includes("iphone")) return 49999;
  if (t.includes("galaxy s25 ultra") || t.includes("galaxy s24 ultra")) return 129999;
  if (t.includes("galaxy s25+") || t.includes("galaxy s25 plus")) return 99999;
  if (t.includes("galaxy s25") || t.includes("galaxy s24")) return 49999;
  if (t.includes("galaxy z flip")) return 109999;
  if (t.includes("galaxy z fold")) return 164999;
  if (t.includes("galaxy s23")) return 39999;
  if (t.includes("samsung")) return 19999;
  if (t.includes("pixel 9 pro")) return 109999;
  if (t.includes("pixel")) return 49999;
  if (t.includes("oneplus 13")) return 69999;
  if (t.includes("oneplus")) return 34999;
  if (t.includes("oppo")) return 24999;
  if (t.includes("vivo")) return 21999;
  if (t.includes("realme")) return 14999;
  if (t.includes("redmi") || t.includes("poco")) return 12999;
  if (t.includes("macbook")) return 99999;
  if (t.includes("laptop")) return 55999;
  if (t.includes("tablet") || t.includes("ipad")) return 34999;
  if (t.includes("watch")) return 14999;
  if (t.includes("earbuds") || t.includes("airpods")) return 9999;
  if (t.includes("headphone")) return 7999;
  if (t.includes("tv") || t.includes("television")) return 34999;
  return 29999;
}

module.exports = { generateSimulatedResults };
