/**
 * SmartCompare Pro — JioMart Scraper (Cheerio — static)
 *
 * Scrapes JioMart product pages for grocery products.
 * Uses Cheerio for static HTML parsing — no browser needed.
 * Rate limit: 5s between requests.
 */

const cheerio = require("cheerio");
const logger = require("../utils/logger");

/**
 * Scrape JioMart product page.
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

    if (!response.ok) throw new Error(`JioMart: HTTP ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract title
    const title = $("h1.product-title").text().trim()
      || $(".product-name").text().trim()
      || $("h1").first().text().trim();
    if (!title) throw new Error("JioMart: product title not found");

    // Extract price
    const priceText = $(".final-price").text().trim()
      || $("#price_box_final_price").text().trim()
      || $('[class*="price"]').first().text().trim();
    if (!priceText) throw new Error("JioMart: price not found");
    const price = parseInt(priceText.replace(/[^0-9]/g, ""), 10);
    if (isNaN(price)) throw new Error(`JioMart: failed to parse price: "${priceText}"`);

    // Extract brand
    const brand = $(".brand-name").text().trim()
      || $('[class*="brand"]').first().text().trim()
      || "";

    // Availability
    const soldOut = $('[class*="out-of-stock"], [class*="sold-out"]');
    const availability = soldOut.length > 0 ? "out_of_stock" : "in_stock";

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "jiomart",
    });

    return { title, price, brand, availability, platform: "jiomart", url };
  } catch (err) {
    throw new Error(`JioMart scraper failed: ${err.message}`);
  }
}

module.exports = { scrape };
