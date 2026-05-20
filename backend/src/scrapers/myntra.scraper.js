const { launchBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

/**
 * Scrape Myntra product page.
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

    // Extract brand (also serves as part of title)
    let brand = "";
    const brandEl = await page.$(".pdp-title h1, .pdp-name .pdp-title");
    if (brandEl) {
      brand = (await brandEl.textContent()).trim();
    }

    // Extract title
    const titleEl = await page.$(".pdp-title, .pdp-name");
    if (!titleEl) throw new Error("Myntra: .pdp-title selector not found");
    const title = (await titleEl.textContent()).trim();

    // Extract price
    const priceEl = await page.$(".pdp-price strong, .pdp-discount-container .pdp-price strong");
    if (!priceEl) throw new Error("Myntra: .pdp-price strong selector not found");
    const priceText = await priceEl.textContent();
    const price = parsePrice(priceText);

    // Extract style ID from URL
    let styleId = "";
    const styleMatch = url.match(/\/buy\/.*?\/(\d+)/);
    if (styleMatch) styleId = styleMatch[1];

    // Availability (Myntra shows "SOLD OUT" or "Out of Stock")
    const soldOutEl = await page.$(".size-buttons-soldOut, .pdp-out-of-stock");
    const availability = soldOutEl ? "out_of_stock" : "in_stock";

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "myntra",
    });

    return { title, price, brand, styleId, availability, platform: "myntra", url };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrape };
