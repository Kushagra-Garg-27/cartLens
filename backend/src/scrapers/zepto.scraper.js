/**
 * SmartCompare Pro — Zepto Scraper (Playwright)
 *
 * Scrapes Zepto product pages for grocery/quick commerce.
 * Requires location context — defaults to Mumbai (lat: 19.0760, lng: 72.8777).
 * Rate limit: 5-10s between requests.
 */

const { launchBrowser, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

// Default geolocation: Mumbai
const DEFAULT_LOCATION = { latitude: 19.0760, longitude: 72.8777 };

/**
 * Scrape Zepto product page.
 * @param {string} url
 * @returns {Promise<Object>}
 */
async function scrape(url) {
  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      geolocation: DEFAULT_LOCATION,
      permissions: ["geolocation"],
      locale: "en-IN",
      timezoneId: "Asia/Kolkata",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    // Random delay 5-10s
    const delay = Math.floor(Math.random() * 5000) + 5000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for dynamic content
    await page.waitForTimeout(3000);

    // Extract title
    const titleEl = await page.$(".product-name")
      || await page.$("h1")
      || await page.$('[class*="product-title"]');
    if (!titleEl) throw new Error("Zepto: product title selector not found");
    const title = (await titleEl.textContent()).trim();

    // Extract price
    const priceEl = await page.$(".final-price")
      || await page.$('[class*="price"]');
    if (!priceEl) throw new Error("Zepto: price selector not found");
    const priceText = await priceEl.textContent();
    const price = parsePrice(priceText);

    // Availability — check for "Add to Cart" button
    const addToCartEl = await page.$('button:has-text("Add to Cart")')
      || await page.$('button:has-text("Add")');
    const availability = addToCartEl ? "in_stock" : "out_of_stock";

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "zepto",
    });

    return { title, price, availability, platform: "zepto", url };
  } catch (err) {
    throw new Error(`Zepto scraper failed: ${err.message}`);
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrape };
