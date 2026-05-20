/**
 * SmartCompare Pro — Reliance Digital Scraper (Cheerio — static)
 *
 * Scrapes Reliance Digital product pages for electronics.
 * Uses Cheerio for static HTML parsing — no browser needed.
 * Rate limit: 5s between requests.
 */

const cheerio = require("cheerio");
const logger = require("../utils/logger");

/**
 * Scrape Reliance Digital product page.
 * @param {string} url
 * @returns {Promise<Object>}
 */
async function scrape(url) {
  try {
    // Random delay 5-10s
    const delay = Math.floor(Math.random() * 5000) + 5000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-IN,en;q=0.9",
      },
    });

    if (!response.ok) throw new Error(`Reliance Digital: HTTP ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);

    // Handle search URLs
    if (url.includes("/search?q=")) {
      const firstResult = $("a[href*='/p/']").first();
      if (firstResult.length === 0) {
        throw new Error("Reliance Digital: No search results found");
      }
      const productUrl = firstResult.attr("href");
      if (productUrl) {
        url = productUrl.startsWith("http") ? productUrl : "https://www.reliancedigital.in" + productUrl;
        return scrape(url);
      }
    }

    // Extract title
    const title = $(".pdp__product-name").text().trim()
      || $("h1.product-name").text().trim()
      || $("h1").first().text().trim();
    if (!title) throw new Error("Reliance Digital: product title not found");

    // Extract price
    const priceText = $(".final-price").text().trim()
      || $(".pdp__offer-price").text().trim()
      || $('[class*="price"]').first().text().trim();
    if (!priceText) throw new Error("Reliance Digital: price not found");
    const price = parseInt(priceText.replace(/[^0-9]/g, ""), 10);
    if (isNaN(price)) throw new Error(`Reliance Digital: failed to parse price: "${priceText}"`);

    // Extract brand
    const brand = $(".pdp__brand-name").text().trim()
      || $('[class*="brand"]').first().text().trim()
      || "";

    // Extract model number from spec table
    let modelNumber = "";
    $("table tr, .specifications tr, .spec-row").each(function () {
      const label = $(this).find("td:first-child, th").text().trim().toLowerCase();
      if (label.includes("model") || label.includes("part number")) {
        modelNumber = $(this).find("td:last-child").text().trim();
      }
    });

    // Availability
    const addToCartBtn = $('[class*="add-to-cart"], button:contains("Add to Cart")');
    const availability = addToCartBtn.length > 0 ? "in_stock" : "out_of_stock";

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "reliancedigital",
    });

    return { title, price, brand, modelNumber, availability, platform: "reliancedigital", url };
  } catch (err) {
    throw new Error(`Reliance Digital scraper failed: ${err.message}`);
  }
}

module.exports = { scrape };
