const { acquireBrowser, releaseBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

/**
 * Scrape FirstCry product page.
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

    // Handle search URLs or if the url is not a product detail page (does not contain /product-detail)
    if (!url.includes("/product-detail") || url.includes("/search") || url.includes("q=")) {
      // Wait for product links to render
      await page.waitForSelector("a[href*='/product-detail']", { timeout: 15000 }).catch(() => {});
      
      const productUrl = await page.evaluate(() => {
        const pdLink = document.querySelector('a[href*="/product-detail"]');
        return pdLink ? pdLink.getAttribute("href") : null;
      });

      if (!productUrl) throw new Error("FirstCry: No search results found");
      
      if (productUrl.startsWith("//")) {
        url = "https:" + productUrl;
      } else if (productUrl.startsWith("/")) {
        url = "https://www.firstcry.com" + productUrl;
      } else {
        url = productUrl;
      }
      
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    // Wait for content to render
    await page.waitForTimeout(2000);

    // Extract title
    const title = await page.evaluate(() => {
      const selectors = [
        "h1.title",
        ".product-title",
        "h1"
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText && el.innerText.trim()) {
          return el.innerText.trim();
        }
      }
      return document.title || "";
    });

    let cleanTitle = title;
    if (cleanTitle) {
      cleanTitle = cleanTitle.replace(/\s*[-|:|•]\s*(FirstCry|First Cry).*/i, "").trim();
    }
    if (!cleanTitle) throw new Error("FirstCry: product title not found");

    // Extract price using multi-strategy evaluation
    const price = await page.evaluate(() => {
      function cleanPrice(s) {
        if (!s) return null;
        let clean = String(s).trim();
        // Split on MRP/Off to isolate selling price from combined text
        const parts = clean.split(/(?:MRP|mrp|Off|off|Save|save|Discount|discount|%)/i);
        if (parts.length > 0) clean = parts[0];
        // Strip trailing paise (.XX) — Indian prices rarely use paise
        if (/\.\d{2}$/.test(clean)) {
          clean = clean.substring(0, clean.length - 3);
        } else if (/\.\d{1}$/.test(clean)) {
          clean = clean.substring(0, clean.length - 2);
        }
        const c = clean.replace(/[^0-9]/g, "");
        return c ? parseInt(c, 10) : null;
      }

      const priceSelectors = [".r1_btm", ".price-discounted", ".final-price", '[class*="offer-price"]', '[class*="price"]', ".rupee_btm"];
      for (const sel of priceSelectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText) {
          const val = cleanPrice(el.innerText);
          if (val && val > 0) return val;
        }
      }
      return null;
    });

    if (!price) throw new Error("FirstCry: price not found");

    // Extract brand
    let brand = "";
    const brandEl = await page.$(".brand-name") || await page.$('[class*="brand"]');
    if (brandEl) {
      brand = (await brandEl.textContent()).trim();
    }

    // Extract image URL
    let imageUrl = "";
    const imgEl = await page.$(".pdp-img img") || await page.$("#pdpImg") || await page.$("img");
    if (imgEl) {
      imageUrl = await imgEl.getAttribute("src") || "";
    }

    // Availability — check for sold out / out of stock indicators
    const soldOutEl = await page.$('[class*="sold-out"]') || await page.$('[class*="out-of-stock"]');
    const availability = soldOutEl ? "out_of_stock" : "in_stock";

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "firstcry",
    });

    return { title: cleanTitle, price, brand, imageUrl, availability, platform: "firstcry", url };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await releaseBrowser(browser);
  }
}

module.exports = { scrape };
