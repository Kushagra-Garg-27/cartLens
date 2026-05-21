const { acquireBrowser, releaseBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

async function scrape(url) {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Handle search URLs
    if (url.includes("search") || url.includes("q=") || url.includes("query=")) {
      await page.waitForTimeout(2000);
      const productUrl = await page.evaluate(() => {
        // Try to find product anchors inside known grid classes first
        const gridSelectors = [
          '.product-grid a[href*="/p/"]', '.search-results a[href*="/p/"]',
          '.de-product-grid a[href*="/p/"]', '.products-grid a[href*="/p/"]',
          'div[class*="grid"] a[href*="/p/"]', 'div[class*="list"] a[href*="/p/"]'
        ];
        for (const sel of gridSelectors) {
          try {
            const el = document.querySelector(sel);
            if (el) {
              const href = el.getAttribute("href");
              if (href && href.includes("/p/")) return href;
            }
          } catch (e) {}
        }
        // Fallback: any product link `/p/` that is not inside header or footer
        const allLinks = document.querySelectorAll('a[href*="/p/"]');
        for (const link of allLinks) {
          let parent = link.parentElement;
          let isNavOrFooter = false;
          while (parent) {
            const tag = parent.tagName.toLowerCase();
            const cls = (parent.className || "").toString().toLowerCase();
            const id = (parent.id || "").toString().toLowerCase();
            if (tag === 'header' || tag === 'footer' || tag === 'nav' || 
                cls.includes('menu') || cls.includes('nav') || cls.includes('header') || cls.includes('footer') ||
                id.includes('menu') || id.includes('nav') || id.includes('header') || id.includes('footer')) {
              isNavOrFooter = true;
              break;
            }
            parent = parent.parentElement;
          }
          if (!isNavOrFooter) {
            const href = link.getAttribute("href");
            if (href) return href;
          }
        }
        return null;
      });

      if (!productUrl) throw new Error("Decathlon: No search results found");
      url = productUrl.startsWith("http") ? productUrl : "https://www.decathlon.in" + productUrl;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    // Wait for content to render
    await page.waitForTimeout(2000);

    const titleEl = await page.$("h1");
    const title = titleEl ? (await titleEl.textContent()).trim() : "Unknown Title";

    const priceEl = await page.$("[data-aut=product-price]") || await page.$('[class*="price"]');
    if (!priceEl) throw new Error("Decathlon: price selector not found");
    const priceText = await priceEl.textContent();
    const price = parsePrice(priceText);

    // Extract image URL
    let imageUrl = "";
    const imgEl = await page.$(".product-image img") || await page.$("img");
    if (imgEl) {
      imageUrl = await imgEl.getAttribute("src") || "";
    }

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "decathlon",
    });

    return { title, price, brand: "Decathlon", modelNumber: "", availability: "in_stock", platform: "decathlon", url };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await releaseBrowser(browser);
  }
}

module.exports = { scrape };
