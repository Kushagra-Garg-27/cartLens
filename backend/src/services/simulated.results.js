/**
 * SmartCompare Pro — Simulated Results Generator
 * Produces realistic cross-platform comparison data when scrapers
 * haven't returned results yet (dev/demo mode).
 */

const PLATFORM_INFO = {
  "amazon.in": { label: "Amazon", searchUrl: "https://www.amazon.in/s?k=" },
  "flipkart.com": { label: "Flipkart", searchUrl: "https://www.flipkart.com/search?q=" },
  "croma": { label: "Croma", searchUrl: "https://www.croma.com/searchB?q=" },
  "reliancedigital": { label: "Reliance Digital", searchUrl: "https://www.reliancedigital.in/search?q=" },
  "tatacliq": { label: "TataCliq", searchUrl: "https://www.tatacliq.com/search/?searchCategory=all&text=" },
};

// Electronics-category platforms to simulate for phones/laptops/electronics
const ELECTRONICS_PLATFORMS = ["amazon.in", "flipkart.com", "croma", "reliancedigital", "tatacliq"];

/**
 * Generate a seeded pseudo-random number from a string.
 */
function hashSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Deterministic random based on seed (so same product always gets same prices).
 */
function seededRandom(seed, index) {
  const x = Math.sin(seed + index * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Generate simulated comparison results for a product.
 * @param {Object} opts
 * @param {string} opts.title - Product title
 * @param {number|null} opts.price - Source price (can be null)
 * @param {string} opts.platform - Source platform
 * @param {string} opts.url - Source URL
 * @param {string} opts.productId - Product UUID
 */
function generateSimulatedResults({ title, price, platform, url, productId }) {
  const seed = hashSeed(title || url || "product");
  
  // If no price from extraction, estimate from title keywords
  const basePrice = price || estimatePriceFromTitle(title);
  
  // Select platforms to simulate (exclude source)
  const targetPlatforms = ELECTRONICS_PLATFORMS.filter(p => p !== platform);
  
  // Generate results — source platform first, then simulated
  const results = [];
  const now = new Date().toISOString();
  
  // Source listing (the page user is on) — always match_confidence=1
  results.push({
    platform: platform,
    title: title || "Product",
    price: basePrice,
    currency: "INR",
    availability: "in_stock",
    url: url,
    match_confidence: 1.0,
    match_method: "extension",
    last_scraped_at: now,
    deal_tags: [],
    price_history: [],
    ageInHours: 0,
    ageWarning: null,
  });
  
  // Simulated cross-platform results
  targetPlatforms.forEach((plat, idx) => {
    const variation = seededRandom(seed, idx + 1);
    // Price varies ±12% from base, with a slight bias toward being more expensive
    const priceMult = 0.88 + (variation * 0.24);
    const simPrice = Math.round((basePrice * priceMult) / 100) * 100 + 99;
    
    const conf = 0.85 + seededRandom(seed, idx + 10) * 0.15;
    const hoursAgo = Math.floor(seededRandom(seed, idx + 20) * 48) + 1;
    const scrapedAt = new Date(Date.now() - hoursAgo * 3600000).toISOString();
    
    const searchQuery = encodeURIComponent(title || "product");
    const simUrl = (PLATFORM_INFO[plat]?.searchUrl || "https://www.google.com/search?q=") + searchQuery;
    
    results.push({
      platform: plat,
      title: title || "Product",
      price: simPrice,
      currency: "INR",
      availability: seededRandom(seed, idx + 30) > 0.15 ? "in_stock" : "out_of_stock",
      url: simUrl,
      match_confidence: parseFloat(conf.toFixed(2)),
      match_method: "title_match",
      last_scraped_at: scrapedAt,
      deal_tags: [],
      price_history: [],
      ageInHours: hoursAgo,
      ageWarning: hoursAgo > 24 ? "Data may be outdated" : null,
    });
  });
  
  // Sort: in_stock first, then by price ascending
  results.sort((a, b) => {
    if (a.availability === "in_stock" && b.availability !== "in_stock") return -1;
    if (a.availability !== "in_stock" && b.availability === "in_stock") return 1;
    return (a.price || 999999) - (b.price || 999999);
  });
  
  // Compute deal tags
  const inStockPrices = results.filter(r => r.availability === "in_stock").map(r => r.price);
  const minPrice = Math.min(...inStockPrices);
  results.forEach(r => {
    if (r.price === minPrice && inStockPrices.length > 1) {
      r.deal_tags.push("BEST_PRICE");
    }
  });
  
  // Best deal
  const cheapest = results.find(r => r.price === minPrice && r.availability === "in_stock");
  const sourcePrice = basePrice;
  const best_deal = cheapest && cheapest.price < sourcePrice ? {
    platform: cheapest.platform,
    price: cheapest.price,
    savings_percent: parseFloat(((sourcePrice - cheapest.price) / sourcePrice * 100).toFixed(1)),
    savings_amount: sourcePrice - cheapest.price,
  } : null;
  
  // Generate price history (6 months of daily data)
  const priceHistory = generatePriceHistory(basePrice, seed, 180);
  
  // Price stats from history
  const histPrices = priceHistory.map(h => h.price);
  const allTimeHigh = Math.max(...histPrices);
  const allTimeLow = Math.min(...histPrices);
  const last90 = priceHistory.slice(-90);
  const avg90 = last90.length > 0 ? Math.round(last90.reduce((s, h) => s + h.price, 0) / last90.length) : basePrice;
  
  const price_stats = {
    all_time_high: allTimeHigh,
    all_time_low: allTimeLow,
    avg_price_90d: avg90,
    last_sale_price: null,
    last_sale_date: null,
  };
  
  // Buy recommendation
  const pricePosition = basePrice <= allTimeLow * 1.05 ? "near_low" : basePrice >= allTimeHigh * 0.95 ? "near_high" : "mid";
  let buyScore, buyLabel, buyReason;
  if (pricePosition === "near_low") {
    buyScore = 82;
    buyLabel = "Great time to buy!";
    buyReason = "Price is near the all-time low";
  } else if (pricePosition === "near_high") {
    buyScore = 30;
    buyLabel = "Wait for a price drop";
    buyReason = "Price is near the all-time high";
  } else {
    buyScore = 55;
    buyLabel = "Decent price";
    buyReason = "Price is in the average range";
  }
  
  const buy_recommendation = {
    score: buyScore,
    label: buyLabel,
    reason: buyReason,
    score_1week: Math.min(100, buyScore + 5),
    score_1month: Math.min(100, buyScore + 12),
  };
  
  // Deal score
  const dealScore = Math.min(100, Math.max(0, Math.round(
    (1 - (basePrice - allTimeLow) / (allTimeHigh - allTimeLow || 1)) * 80 + 10
  )));
  const dealBadge = dealScore >= 75 ? "Great Deal" : dealScore >= 50 ? "Good Deal" : dealScore >= 30 ? "Fair" : "Overpriced";
  
  let dealContextLabel, dealContextDetail;
  if (basePrice <= allTimeLow * 1.02) {
    dealContextLabel = "At All-Time Low";
    dealContextDetail = "This is the lowest price we've tracked";
  } else {
    const diff = basePrice - allTimeLow;
    dealContextLabel = "Near All-Time Low";
    dealContextDetail = `Only \u20b9${diff.toLocaleString("en-IN")} above the lowest recorded price`;
  }
  
  return {
    status: "found",
    product_id: productId,
    product_title: title || "Product",
    partial: false,
    job_ids: [],
    results,
    best_deal,
    on_watchlist: false,
    watchlist_target_price: null,
    deal_score: dealScore,
    deal_score_breakup: [],
    deal_badge: dealBadge,
    deal_context_tag: { label: dealContextLabel, detail: dealContextDetail },
    price_stats,
    price_history: priceHistory,
    buy_recommendation,
  };
}

/**
 * Generate realistic price history with trends and fluctuations.
 */
function generatePriceHistory(basePrice, seed, days) {
  const history = [];
  const now = new Date();
  
  // Create a price journey: start high, drop for sales, recover, current
  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    const dayFraction = i / days;
    
    // Base trend: starts ~15% higher, trends down to current
    const trendMult = 1 + (dayFraction * 0.15);
    
    // Seasonal dips (simulate sale events)
    let saleDip = 0;
    const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
    // Big Billion Days / Great Indian Festival (~Oct, day ~275)
    if (Math.abs(dayOfYear - 275) < 5) saleDip = 0.12;
    // Republic Day sale (~Jan 26, day ~26)
    if (Math.abs(dayOfYear - 26) < 3) saleDip = 0.08;
    // Random flash sales
    if (seededRandom(seed, i + 100) > 0.92) saleDip = 0.06;
    
    // Daily noise (±3%)
    const noise = (seededRandom(seed, i) - 0.5) * 0.06;
    
    const dayPrice = Math.round(basePrice * trendMult * (1 - saleDip) * (1 + noise) / 100) * 100 - 1;
    
    // Only add every 2-3 days to avoid clutter
    if (i % 3 === 0 || saleDip > 0) {
      history.push({
        date: date.toISOString().split("T")[0],
        price: Math.max(Math.round(basePrice * 0.8), dayPrice),
      });
    }
  }
  
  // Ensure current price is the last entry
  history.push({
    date: now.toISOString().split("T")[0],
    price: basePrice,
  });
  
  return history;
}

/**
 * Estimate a reasonable price from product title keywords.
 */
function estimatePriceFromTitle(title) {
  if (!title) return 29999;
  const t = title.toLowerCase();
  
  if (t.includes("iphone 16 pro max")) return 144900;
  if (t.includes("iphone 16 pro")) return 119900;
  if (t.includes("iphone 16")) return 69900;
  if (t.includes("iphone 15")) return 59900;
  if (t.includes("iphone")) return 49999;
  
  if (t.includes("galaxy s24 ultra")) return 129999;
  if (t.includes("galaxy s24")) return 49999;
  if (t.includes("galaxy s23")) return 39999;
  if (t.includes("samsung")) return 19999;
  
  if (t.includes("pixel 9 pro")) return 109999;
  if (t.includes("pixel")) return 49999;
  
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
