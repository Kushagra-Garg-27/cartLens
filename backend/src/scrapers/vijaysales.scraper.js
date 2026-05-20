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
    if (url.includes("Search=") || url.includes("search=")) {
      const firstResult = await page.$(".product-item a, .Productbox a");
      if (!firstResult) throw new Error("VijaySales: No search results found");
      const productUrl = await firstResult.getAttribute("href");
      if (productUrl) {
        url = productUrl.startsWith("http") ? productUrl : "https://www.vijaysales.com" + productUrl;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      }
    }

    const titleEl = await page.$("h1");
    const title = titleEl ? (await titleEl.textContent()).trim() : "Unknown Title";

    const priceEl = await page.$(".product-price");
    if (!priceEl) throw new Error("VijaySales: .product-price not found");
    const priceText = await priceEl.textContent();
    const price = parsePrice(priceText);

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "vijaysales",
    });

    return { title, price, brand: "", modelNumber: "", availability: "in_stock", platform: "vijaysales", url };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrape };
