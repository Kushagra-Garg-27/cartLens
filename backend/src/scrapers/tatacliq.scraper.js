/**
 * SmartCompare Pro — TataCliq Scraper (Playwright)
 *
 * Scrapes TataCliq product pages for fashion, electronics, and beauty.
 * Search URL: https://www.tatacliq.com/search/?searchCategory=all&q={query}
 */

const { launchBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

/**
 * Scrape TataCliq product page.
 * @param {string} url
 * @returns {Promise<Object>}
 */
async function scrape(url) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await newStealthPage(browser);

    await randomDelay();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for content to render
    await page.waitForTimeout(2000);

    // Extract title
    const titleEl = await page.$(".pdp-title") || await page.$("h1.product-title") || await page.$("h1");
    if (!titleEl) throw new Error("TataCliq: product title selector not found");
    const title = (await titleEl.textContent()).trim();

    // Extract price
    const priceEl = await page.$(".final-price") || await page.$('[class*="price"]');
    if (!priceEl) throw new Error("TataCliq: price selector not found");
    const priceText = await priceEl.textContent();
    const price = parsePrice(priceText);

    // Extract brand
    let brand = "";
    const brandEl = await page.$(".brand-name") || await page.$('[class*="brand"]');
    if (brandEl) {
      brand = (await brandEl.textContent()).trim();
    }

    // Extract image URL
    let imageUrl = "";
    const imgEl = await page.$(".ProductImage img") || await page.$(".pdp-image img");
    if (imgEl) {
      imageUrl = await imgEl.getAttribute("src") || "";
    }

    // Availability — check for "Add To Bag" button
    const addToBagEl = await page.$('button:has-text("Add To Bag")') || await page.$('[class*="add-to-bag"]');
    const availability = addToBagEl ? "in_stock" : "out_of_stock";

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "tatacliq",
    });

    return { title, price, brand, imageUrl, availability, platform: "tatacliq", url };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrape };
