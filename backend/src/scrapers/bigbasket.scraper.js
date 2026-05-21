const { acquireBrowser, releaseBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

/**
 * Scrape BigBasket product page.
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

    // Handle search URLs or if the url is not a product detail page (does not contain /pd/)
    if (!url.includes("/pd/") || url.includes("/ps/") || url.includes("q=")) {
      // Wait for product links to render
      await page.waitForSelector("a[href*='/pd/']", { timeout: 15000 }).catch(() => {});
      
      const productUrl = await page.evaluate(() => {
        // Try various selectors or find any anchor containing /pd/
        const pdLink = document.querySelector('a[href*="/pd/"]');
        return pdLink ? pdLink.getAttribute("href") : null;
      });

      if (!productUrl) throw new Error("BigBasket: No search results found");
      url = productUrl.startsWith("http") ? productUrl : "https://www.bigbasket.com" + productUrl;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    // Wait for content to render
    await page.waitForTimeout(2000);

    // Extract title
    const titleEl = await page.$("h1.prod-name") || await page.$(".product-name") || await page.$("h1");
    if (!titleEl) throw new Error("BigBasket: product title selector not found");
    const title = (await titleEl.textContent()).trim();

    // Extract price
    const priceEl = await page.$(".discnt-price") || await page.$('[qa="final-price"]') || await page.$('[class*="price"]');
    if (!priceEl) throw new Error("BigBasket: price selector not found");
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
    const imgEl = await page.$(".ProductImage img") || await page.$('[class*="image-container"] img') || await page.$("img");
    if (imgEl) {
      imageUrl = await imgEl.getAttribute("src") || "";
    }

    // Availability — check for sold out / out of stock indicators
    const soldOutEl = await page.$('[class*="out-of-stock"]') || await page.$('[class*="sold-out"]');
    const availability = soldOutEl ? "out_of_stock" : "in_stock";

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "bigbasket",
    });

    return { title, price, brand, imageUrl, availability, platform: "bigbasket", url };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await releaseBrowser(browser);
  }
}

module.exports = { scrape };
