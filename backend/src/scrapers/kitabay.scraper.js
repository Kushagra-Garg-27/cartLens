const logger = require("../utils/logger");
const { parsePrice } = require("./playwright.base");

async function scrape(url) {
  const fetch = (await import("node-fetch")).default;
  const cheerio = require("cheerio");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
    timeout: 15000,
  });

  if (!response.ok) {
    throw new Error(`Kitabay: HTTP ${response.status} for ${url}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Handle search URLs
  if (url.includes("/search?q=")) {
    const firstResult = $("a.card__heading").first(); // Based on Shopify typical theme or just 'a[href*="/products/"]'
    const productUrl = firstResult.length > 0 ? firstResult.attr("href") : $("a[href*='/products/']").first().attr("href");
    
    if (!productUrl) throw new Error("Kitabay: No search results found");
    
    url = productUrl.startsWith("http") ? productUrl : "https://kitabay.com" + productUrl;
    const prodRes = await fetch(url, { headers: response.headers || {} });
    if (!prodRes.ok) throw new Error(`Kitabay: HTTP ${prodRes.status} for product ${url}`);
    return scrape(url);
  }

  const title = $("h1").first().text().trim();
  const priceText = $(".price__regular .price-item--regular, .price-item--sale").first().text().trim();
  if (!priceText) throw new Error("Kitabay: price selector not found");
  const price = parsePrice(priceText);

  logger.info({
    service: "scraper",
    event: "scrape_complete",
    platform: "kitabay",
  });

  return { title, price, brand: "", modelNumber: "", availability: "in_stock", platform: "kitabay", url };
}

module.exports = { scrape };
