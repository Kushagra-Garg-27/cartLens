const logger = require("../utils/logger");
const { parsePrice } = require("./playwright.base");

/**
 * Scrape Croma product page using Cheerio (static fetch — no Playwright).
 * @param {string} url
 * @returns {Promise<Object>}
 */
async function scrape(url) {
  // Dynamic import for node-fetch (ESM)
  const fetch = (await import("node-fetch")).default;
  const cheerio = require("cheerio");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-IN,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    timeout: 15000,
  });

  if (!response.ok) {
    throw new Error(`Croma: HTTP ${response.status} for ${url}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Handle search URLs
  if (url.includes("searchB?q=")) {
    const firstResult = $("div.product-item h3.product-title a, a.product-title").first();
    if (firstResult.length === 0) {
      throw new Error("Croma: No search results found");
    }
    const productUrl = firstResult.attr("href");
    if (productUrl) {
      url = productUrl.startsWith("http") ? productUrl : "https://www.croma.com" + productUrl;
      const prodRes = await fetch(url, { headers: response.headers || {} });
      if (!prodRes.ok) throw new Error(`Croma: HTTP ${prodRes.status} for product ${url}`);
      const prodHtml = await prodRes.text();
      return scrape(url); // Recursive call with actual product URL to reuse parsing logic
    }
  }

  // Extract title
  const title = $(".pd-title, .product-title h1").first().text().trim();
  if (!title) throw new Error("Croma: .pd-title selector not found");

  // Extract price
  const priceText = $(".pdp-price, .new-price, .pd-price span").first().text().trim();
  if (!priceText) throw new Error("Croma: .pdp-price selector not found");
  const price = parsePrice(priceText);

  // Extract model number
  let modelNumber = "";
  const modelEl = $('[data-testid="model-number"], .pd-info td:contains("Model")');
  if (modelEl.length > 0) {
    modelNumber = modelEl.next("td").text().trim() || modelEl.text().trim();
  }

  // Availability
  const outOfStock = $(".out-of-stock, .sold-out").length > 0;
  const availability = outOfStock ? "out_of_stock" : "in_stock";

  logger.info({
    service: "scraper",
    event: "scrape_complete",
    platform: "croma",
  });

  return { title, price, modelNumber, availability, platform: "croma", url };
}

module.exports = { scrape };
