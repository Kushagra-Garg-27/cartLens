/**
 * SmartCompare Pro — Centralized Platform Registry
 *
 * Single source of truth for every supported platform.
 * Focused on India's most popular e-commerce platforms.
 * All platforms use INR — no currency conversion needed.
 */

module.exports = {

  // ── TIER 1: The Big Two ────────────────────────────────────────────
  "amazon.in": {
    label: "Amazon",
    color: "#FF9900",
    domain: "amazon.in",
    categories: ["electronics", "home", "fashion", "beauty", "books"],
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
    categories: ["electronics", "home", "fashion", "beauty"],
    scraper: "flipkart",
    method: "playwright",
    searchUrl: (query) => `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`,
    rateLimit: { min: 8000, max: 15000 },
    tier: 1
  },

  // ── TIER 2: Electronics Specialists ────────────────────────────────
  "croma": {
    label: "Croma",
    color: "#65AC2A",
    domain: "croma.com",
    categories: ["electronics"],
    scraper: "croma",
    method: "playwright",
    searchUrl: (query) => `https://www.croma.com/search/?text=${encodeURIComponent(query)}`,
    rateLimit: { min: 5000, max: 10000 },
    tier: 2
  },
  "reliancedigital": {
    label: "Reliance Digital",
    color: "#E31837",
    domain: "reliancedigital.in",
    categories: ["electronics"],
    scraper: "reliancedigital",
    method: "playwright",
    searchUrl: (query) => `https://www.reliancedigital.in/search?q=${encodeURIComponent(query)}`,
    rateLimit: { min: 5000, max: 10000 },
    tier: 2
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
    tier: 2
  },

  // ── TIER 3: Fashion & Beauty ───────────────────────────────────────
  "myntra": {
    label: "Myntra",
    color: "#FF3F6C",
    domain: "myntra.com",
    categories: ["fashion", "beauty"],
    scraper: "myntra",
    method: "playwright",
    searchUrl: (query) => `https://www.myntra.com/${encodeURIComponent(query.replace(/ /g, '-'))}`,
    rateLimit: { min: 10000, max: 20000 },
    tier: 3
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
    tier: 3
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
    tier: 3
  },

  // ── TIER 3: Marketplace & Specialty ────────────────────────────────
  "tatacliq": {
    label: "TataCliq",
    color: "#E31837",
    domain: "tatacliq.com",
    categories: ["electronics", "fashion"],
    scraper: "tatacliq",
    method: "playwright",
    searchUrl: (query) => `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(query)}`,
    rateLimit: { min: 8000, max: 15000 },
    tier: 3
  },
  "firstcry": {
    label: "FirstCry",
    color: "#FF6F61",
    domain: "firstcry.com",
    categories: ["kids", "fashion"],
    scraper: "firstcry",
    method: "cheerio",
    searchUrl: (query) => `https://www.firstcry.com/search?q=${encodeURIComponent(query)}`,
    rateLimit: { min: 8000, max: 15000 },
    tier: 3
  },

  // ── TIER 3: Grocery & Quick Commerce ───────────────────────────────
  "blinkit": {
    label: "Blinkit",
    color: "#F8CB46",
    domain: "blinkit.com",
    categories: ["grocery"],
    scraper: "blinkit",
    method: "playwright",
    searchUrl: (query) => `https://blinkit.com/s/?q=${encodeURIComponent(query)}`,
    rateLimit: { min: 8000, max: 15000 },
    tier: 3
  },

  "bigbasket": {
    label: "BigBasket",
    color: "#84C225",
    domain: "bigbasket.com",
    categories: ["grocery"],
    scraper: "bigbasket",
    method: "cheerio",
    searchUrl: (query) => `https://www.bigbasket.com/ps/?q=${encodeURIComponent(query)}`,
    rateLimit: { min: 8000, max: 15000 },
    tier: 3
  },
  // ── TIER 3: D2C & Specialty ────────────────────────────────────────
  "appleindia": {
    label: "Apple India",
    color: "#555555",
    domain: "apple.com",
    categories: ["electronics"],
    scraper: "appleindia",
    method: "cheerio",
    searchUrl: (query) => {
      if (query && query.toLowerCase().includes("iphone")) {
        return `https://www.apple.com/in/shop/buy-iphone?fh=${encodeURIComponent(query)}`;
      }
      return `https://www.apple.com/in/search/${encodeURIComponent(query)}?src=serp`;
    },
    rateLimit: { min: 10000, max: 20000 },
    tier: 3
  },
  "decathlon": {
    label: "Decathlon",
    color: "#0082C3",
    domain: "decathlon.in",
    categories: ["sports", "fashion"],
    scraper: "decathlon",
    method: "cheerio",
    searchUrl: (query) => `https://www.decathlon.in/search?query=${encodeURIComponent(query)}`,
    rateLimit: { min: 8000, max: 15000 },
    tier: 3
  },
  "kitabay": {
    label: "Kitabay",
    color: "#2C3E50",
    domain: "kitabay.com",
    categories: ["books"],
    scraper: "kitabay",
    method: "cheerio",
    searchUrl: (query) => `https://www.kitabay.com/search?q=${encodeURIComponent(query)}`,
    rateLimit: { min: 5000, max: 10000 },
    tier: 3
  }
};
