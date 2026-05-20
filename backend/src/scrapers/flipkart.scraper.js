const { launchBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

/**
 * Scrape Flipkart product page.
 * @param {string} url
 * @returns {Promise<Object>}
 */
async function scrape(url) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await newStealthPage(browser);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Handle search URLs
    if (url.includes("/search?q=")) {
      // Flipkart usually has links with class CGtC98 or inside '_1fQZEK' or 'VJA3hP'
      // The most generic way is to find the first a tag inside a search result block
      const firstResult = await page.$("a.CGtC98, a.VJA3hP, a._1fQZEK");
      if (!firstResult) throw new Error("Flipkart: No search results found");
      const productUrl = await firstResult.getAttribute("href");
      if (productUrl) {
        url = productUrl.startsWith("http") ? productUrl : "https://www.flipkart.com" + productUrl;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      }
    }

    // Close login popup if present
    const closeBtn = await page.$("button._2KpZ6l._2doB4z");
    if (closeBtn) await closeBtn.click();

    // Extract title
    const titleEl = await page.$(".B_NuCI");
    if (!titleEl) throw new Error("Flipkart: .B_NuCI title selector not found");
    const title = (await titleEl.textContent()).trim();

    // Extract price
    const priceEl = await page.$("._30jeq3._16Jk6d");
    if (!priceEl) throw new Error("Flipkart: ._30jeq3._16Jk6d price selector not found");
    const priceText = await priceEl.textContent();
    const price = parsePrice(priceText);

    // Extract brand
    let brand = "";
    const brandEl = await page.$("._2WkVRV");
    if (brandEl) {
      brand = (await brandEl.textContent()).trim();
    }

    // Extract Flipkart PID from URL
    let flipkartPid = "";
    const pidMatch = url.match(/\/p\/itm([A-Z0-9]+)/i);
    if (pidMatch) flipkartPid = pidMatch[1];

    // Availability
    const outOfStockEl = await page.$("._16FRp0");
    const availability = outOfStockEl ? "out_of_stock" : "in_stock";

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "flipkart",
    });

    return { title, price, brand, flipkartPid, availability, platform: "flipkart", url };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrape };
