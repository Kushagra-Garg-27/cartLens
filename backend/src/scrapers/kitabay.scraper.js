const { acquireBrowser, releaseBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

/**
 * Scrape Kitabay product page.
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

    // Handle search URLs or if the url is not a product detail page (does not contain /products/)
    if (!url.includes("/products/") || url.includes("/search") || url.includes("q=")) {
      // Wait for product links to render
      await page.waitForSelector("a[href*='/products/']", { timeout: 15000 }).catch(() => {});
      
      const productUrl = await page.evaluate(() => {
        // Try various selectors or find any anchor containing /products/
        const pdLink = document.querySelector('a[href*="/products/"]');
        return pdLink ? pdLink.getAttribute("href") : null;
      });

      if (!productUrl) throw new Error("Kitabay: No search results found");
      url = productUrl.startsWith("http") ? productUrl : "https://kitabay.com" + productUrl;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    // Wait for content to render
    await page.waitForTimeout(2000);

    // Extract title
    const titleEl = await page.$("h1") || await page.$(".product-title") || await page.$(".title");
    if (!titleEl) throw new Error("Kitabay: product title selector not found");
    const title = (await titleEl.textContent()).trim();

    // Extract price
    const priceEl = await page.$(".price__regular .price-item--regular") || await page.$(".price-item--sale") || await page.$(".price-item--regular") || await page.$('[class*="price"]');
    if (!priceEl) throw new Error("Kitabay: price selector not found");
    const priceText = await priceEl.textContent();
    const price = parsePrice(priceText);

    // Extract image URL
    let imageUrl = "";
    const imgEl = await page.$(".product__media img") || await page.$("img");
    if (imgEl) {
      imageUrl = await imgEl.getAttribute("src") || "";
    }

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "kitabay",
    });

    return { title, price, brand: "Kitabay", imageUrl, availability: "in_stock", platform: "kitabay", url };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await releaseBrowser(browser);
  }
}

module.exports = { scrape };
