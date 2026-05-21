/**
 * SmartCompare Pro — Nykaa Scraper (Playwright)
 *
 * Scrapes Nykaa product pages for beauty and fashion products.
 * Search URL: https://www.nykaa.com/search/result/?q={query}
 */

const { acquireBrowser, releaseBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

/**
 * Scrape Nykaa product page.
 * @param {string} url
 * @returns {Promise<Object>}
 */
async function scrape(url) {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Handle search URLs or if the url is not a product detail page (does not contain /p/)
    if (!url.includes("/p/") || url.includes("search") || url.includes("q=")) {
      await page.waitForSelector("a[href*='/p/']", { timeout: 15000 }).catch(() => {});
      
      const productUrl = await page.evaluate(() => {
        const pdLink = document.querySelector('a[href*="/p/"]');
        return pdLink ? pdLink.getAttribute("href") : null;
      });

      if (!productUrl) throw new Error("Nykaa: No search results found");
      url = productUrl.startsWith("http") ? productUrl : "https://www.nykaa.com" + productUrl;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    // Wait for content to render
    await page.waitForTimeout(2000);

    // Extract title
    const titleEl = await page.$(".product-title h1") || await page.$('[data-at="product-name"]') || await page.$("h1");
    if (!titleEl) throw new Error("Nykaa: product title selector not found");
    const title = (await titleEl.textContent()).trim();

    // Extract price
    const priceEl = await page.$(".post-card__info-price") || await page.$(".css-111z9ua") || await page.$('[class*="price"]');
    if (!priceEl) throw new Error("Nykaa: price selector not found");
    const priceText = await priceEl.textContent();
    const price = parsePrice(priceText);

    // Extract brand
    let brand = "";
    const brandEl = await page.$(".product-brand") || await page.$('[data-at="brand-name"]');
    if (brandEl) {
      brand = (await brandEl.textContent()).trim();
    }

    // Extract image URL for hash matching
    let imageUrl = "";
    const imgEl = await page.$(".product-image img") || await page.$(".pdp-image img");
    if (imgEl) {
      imageUrl = await imgEl.getAttribute("src") || "";
    }

    // Availability — check for "Add to Bag" button
    const addToBagEl = await page.$('button:has-text("Add to Bag")') || await page.$('[class*="add-to-bag"]');
    const availability = addToBagEl ? "in_stock" : "out_of_stock";

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "nykaa",
    });

    return { title, price, brand, imageUrl, availability, platform: "nykaa", url };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await releaseBrowser(browser);
  }
}

module.exports = { scrape };
