const { acquireBrowser, releaseBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

/**
 * Scrape Ajio product page.
 * @param {string} url
 * @returns {Promise<Object>}
 */
async function scrape(url) {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);

    await randomDelay();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Extract title
    const titleEl = await page.$(".prod-name, .product-title");
    if (!titleEl) throw new Error("Ajio: .prod-name selector not found");
    const title = (await titleEl.textContent()).trim();

    // Extract price
    const priceEl = await page.$(".prod-sp, .prod-price .prod-sp");
    if (!priceEl) throw new Error("Ajio: .prod-sp price selector not found");
    const priceText = await priceEl.textContent();
    const price = parsePrice(priceText);

    // Extract brand
    let brand = "";
    const brandEl = await page.$(".brand-name, .prod-brand");
    if (brandEl) {
      brand = (await brandEl.textContent()).trim();
    }

    // Extract product code from URL
    let productCode = "";
    const codeMatch = url.match(/\/p\/([a-zA-Z0-9_-]+)/);
    if (codeMatch) productCode = codeMatch[1];

    // Availability
    const soldOutEl = await page.$(".sold-out, .out-of-stock");
    const availability = soldOutEl ? "out_of_stock" : "in_stock";

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "ajio",
    });

    return { title, price, brand, productCode, availability, platform: "ajio", url };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await releaseBrowser(browser);
  }
}

module.exports = { scrape };
