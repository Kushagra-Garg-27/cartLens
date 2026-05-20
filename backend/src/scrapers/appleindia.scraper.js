const { launchBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

async function scrape(url) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await newStealthPage(browser);

    await randomDelay();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Handle search URLs
    if (url.includes("/search/")) {
      const firstResult = await page.$(".rf-serp-productname");
      if (!firstResult) throw new Error("AppleIndia: No search results found");
      const productUrl = await firstResult.getAttribute("href");
      if (productUrl) {
        url = productUrl.startsWith("http") ? productUrl : "https://www.apple.com" + productUrl;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      }
    }

    const titleEl = await page.$("h1");
    const title = titleEl ? (await titleEl.textContent()).trim() : "Unknown Title";

    const priceEl = await page.$(".rc-prices-fullprice, .as-price-currentprice");
    if (!priceEl) throw new Error("AppleIndia: price selector not found");
    const priceText = await priceEl.textContent();
    const price = parsePrice(priceText);

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "appleindia",
    });

    return { title, price, brand: "Apple", modelNumber: "", availability: "in_stock", platform: "appleindia", url };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrape };
