/**
 * SmartCompare Pro — Centralized Platform Registry
 *
 * Single source of truth for every supported platform.
 * Never hardcode platform names, colors, or URLs elsewhere in the codebase.
 */

module.exports = {

  // ── TIER 1: The Big Two ────────────────────────────────────────────
  "amazon.in": {
    label: "Amazon",
    color: "#FF9900",
    domain: "amazon.in",
    categories: ["electronics", "home", "fashion", "beauty", "books", "grocery"],
    scraper: "amazon",
    method: "playwright",
    searchUrl: (query) => `https://www.amazon.in/s?k=${encodeURIComponent(query)}`,
    rateLimit: { min: 8000, max: 15000 },
    tier: 1
  },
  "flipkart": {
    label: "Flipkart",
    color: "#2874F0",
    domain: "flipkart.com",
    categories: ["electronics", "home", "fashion", "beauty", "grocery"],
    scraper: "flipkart",
    method: "playwright",
    searchUrl: (query) => `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`,
    rateLimit: { min: 8000, max: 15000 },
    tier: 1
  },

  // ── TIER 2: Fashion & Beauty ───────────────────────────────────────
  "myntra": {
    label: "Myntra",
    color: "#FF3F6C",
    domain: "myntra.com",
    categories: ["fashion", "beauty"],
    scraper: "myntra",
    method: "playwright",
    searchUrl: (query) => `https://www.myntra.com/${encodeURIComponent(query.replace(/ /g, '-'))}`,
    rateLimit: { min: 10000, max: 20000 },
    tier: 2
  },
  "ajio": {
    label: "Ajio",
    color: "#E31837",
    domain: "ajio.com",
    categories: ["fashion"],
    scraper: "ajio",
    method: "playwright",
    searchUrl: (query) => `https://www.ajio.com/search/?text=${encodeURIComponent(query)}`,
    rateLimit: { min: 10000, max: 20000 },
    tier: 2
  },
  "nykaa": {
    label: "Nykaa",
    color: "#FC2779",
    domain: "nykaa.com",
    categories: ["beauty", "fashion"],
    scraper: "nykaa",
    method: "playwright",
    searchUrl: (query) => `https://www.nykaa.com/search/result/?q=${encodeURIComponent(query)}`,
    rateLimit: { min: 10000, max: 18000 },
    tier: 2
  },
  "tatacliq": {
    label: "TataCliq",
    color: "#7B1FA2",
    domain: "tatacliq.com",
    categories: ["fashion", "electronics", "beauty"],
    scraper: "tatacliq",
    method: "playwright",
    searchUrl: (query) => `https://www.tatacliq.com/search/?searchCategory=all&q=${encodeURIComponent(query)}`,
    rateLimit: { min: 8000, max: 15000 },
    tier: 2
  },
  "firstcry": {
    label: "FirstCry",
    color: "#F05A28",
    domain: "firstcry.com",
    categories: ["fashion", "kids"],
    scraper: "firstcry",
    method: "cheerio",
    searchUrl: (query) => `https://www.firstcry.com/search?q=${encodeURIComponent(query)}`,
    rateLimit: { min: 5000, max: 10000 },
    tier: 2
  },

  "decathlon": {
    label: "Decathlon",
    color: "#0082C3",
    domain: "decathlon.in",
    categories: ["fashion", "sports"],
    scraper: "decathlon",
    method: "playwright",
    searchUrl: (query) => `https://www.decathlon.in/search?query=${encodeURIComponent(query)}`,
    rateLimit: { min: 10000, max: 20000 },
    tier: 2
  },
  "kitabay": {
    label: "Kitabay",
    color: "#F6C142",
    domain: "kitabay.com",
    categories: ["books"],
    scraper: "kitabay",
    method: "cheerio",
    searchUrl: (query) => `https://kitabay.com/search?q=${encodeURIComponent(query)}`,
    rateLimit: { min: 5000, max: 10000 },
    tier: 2
  },

  // ── TIER 3: Electronics ────────────────────────────────────────────
  "croma": {
    label: "Croma",
    color: "#65AC2A",
    domain: "croma.com",
    categories: ["electronics"],
    scraper: "croma",
    method: "cheerio",
    searchUrl: (query) => `https://www.croma.com/searchB?q=${encodeURIComponent(query)}`,
    rateLimit: { min: 5000, max: 10000 },
    tier: 3
  },
  "reliancedigital": {
    label: "Reliance Digital",
    color: "#E31837",
    domain: "reliancedigital.in",
    categories: ["electronics"],
    scraper: "reliancedigital",
    method: "cheerio",
    searchUrl: (query) => `https://www.reliancedigital.in/search?q=${encodeURIComponent(query)}`,
    rateLimit: { min: 5000, max: 10000 },
    tier: 3
  },
  "vijaysales": {
    label: "Vijay Sales",
    color: "#E11B22",
    domain: "vijaysales.com",
    categories: ["electronics"],
    scraper: "vijaysales",
    method: "playwright",
    searchUrl: (query) => `https://www.vijaysales.com/search/${encodeURIComponent(query)}`,
    rateLimit: { min: 10000, max: 20000 },
    tier: 3
  },
  "appleindia": {
    label: "Apple India",
    color: "#000000",
    domain: "apple.com",
    categories: ["electronics"],
    scraper: "appleindia",
    method: "playwright",
    searchUrl: (query) => `https://www.apple.com/in/search/${encodeURIComponent(query)}`,
    rateLimit: { min: 10000, max: 20000 },
    tier: 3
  },

  // ── TIER 4: Quick Commerce / Grocery ──────────────────────────────
  "blinkit": {
    label: "Blinkit",
    color: "#F8D000",
    domain: "blinkit.com",
    categories: ["grocery"],
    scraper: "blinkit",
    method: "playwright",
    searchUrl: (query) => `https://blinkit.com/s/?q=${encodeURIComponent(query)}`,
    rateLimit: { min: 5000, max: 10000 },
    tier: 4
  },
  "zepto": {
    label: "Zepto",
    color: "#8B5CF6",
    domain: "zeptonow.com",
    categories: ["grocery"],
    scraper: "zepto",
    method: "playwright",
    searchUrl: (query) => `https://www.zeptonow.com/search?query=${encodeURIComponent(query)}`,
    rateLimit: { min: 5000, max: 10000 },
    tier: 4
  },
  "bigbasket": {
    label: "BigBasket",
    color: "#84C225",
    domain: "bigbasket.com",
    categories: ["grocery"],
    scraper: "bigbasket",
    method: "cheerio",
    searchUrl: (query) => `https://www.bigbasket.com/ps/?q=${encodeURIComponent(query)}`,
    rateLimit: { min: 5000, max: 10000 },
    tier: 4
  },
  "jiomart": {
    label: "JioMart",
    color: "#003087",
    domain: "jiomart.com",
    categories: ["grocery"],
    scraper: "jiomart",
    method: "cheerio",
    searchUrl: (query) => `https://www.jiomart.com/search/${encodeURIComponent(query)}`,
    rateLimit: { min: 5000, max: 10000 },
    tier: 4
  }
};
