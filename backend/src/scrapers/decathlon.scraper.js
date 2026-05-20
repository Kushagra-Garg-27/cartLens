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
    if (url.includes("/search?query=")) {
      const firstResult = await page.$("a[href*='/p/']");
      if (!firstResult) throw new Error("Decathlon: No search results found");
      const productUrl = await firstResult.getAttribute("href");
      if (productUrl) {
        url = productUrl.startsWith("http") ? productUrl : "https://www.decathlon.in" + productUrl;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      }
    }

    const titleEl = await page.$("h1");
    const title = titleEl ? (await titleEl.textContent()).trim() : "Unknown Title";

    const priceEl = await page.$("[data-aut=product-price]");
    if (!priceEl) throw new Error("Decathlon: price selector not found");
    const priceText = await priceEl.textContent();
    const price = parsePrice(priceText);

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "decathlon",
    });

    return { title, price, brand: "Decathlon", modelNumber: "", availability: "in_stock", platform: "decathlon", url };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrape };
