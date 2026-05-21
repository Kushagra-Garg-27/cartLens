/**
 * SmartCompare Pro — TataCliq Scraper (Playwright)
 *
 * Scrapes TataCliq product pages for fashion, electronics, and beauty.
 * Search URL: https://www.tatacliq.com/search/?searchCategory=all&q={query}
 */

const { acquireBrowser, releaseBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

/**
 * Scrape TataCliq product page.
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

    // Handle search URLs
    const isSearchUrl = url.includes("/search") || url.includes("text=") || url.includes("q=") || url.includes("searchCategory");
    if (isSearchUrl) {
      const queryMatch = url.match(/[?&]text=([^&]+)/) || url.match(/[?&]q=([^&]+)/);
      const query = queryMatch ? decodeURIComponent(queryMatch[1]) : "";

      await page.waitForSelector('a[href*="/p-"]', { timeout: 15000 }).catch(() => {});

      const candidates = await page.evaluate(() => {
        const results = [];
        const links = document.querySelectorAll('a[href*="/p-"]');
        for (const link of links) {
          const href = link.getAttribute("href") || "";
          
          let titleText = "";
          const sib = link.parentElement ? link.parentElement.querySelector(".product-title, .title, span") : null;
          if (sib) {
            titleText = sib.innerText || sib.textContent || "";
          }
          if (!titleText.trim()) {
            titleText = link.innerText || link.textContent || "";
          }

          if (href && titleText.trim() && !results.some(r => r.url === href)) {
            results.push({ url: href, title: titleText.trim() });
          }
        }
        return results.slice(0, 3);
      });

      if (!candidates || candidates.length === 0) throw new Error("TataCliq: No search results found");

      const { pickBestResult } = require("./scraper.utils");
      const bestProductUrl = pickBestResult(candidates, query);
      url = bestProductUrl.startsWith("http") ? bestProductUrl : "https://www.tatacliq.com" + bestProductUrl;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    // Wait for the product name component to hydrate (React SSR needs time)
    await page.waitForSelector(".ProductDetailsMainCard__productName", { timeout: 15000 }).catch(() => {});

    // Extract title
    const title = await page.evaluate(() => {
      const selectors = [
        ".ProductDetailsMainCard__productName",
        ".pdp-title",
        "h1.product-title",
        ".product-name",
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
    logger.info({ service: "scraper", event: "tatacliq_extracted_title", title, cleanTitle });
    if (cleanTitle) {
      cleanTitle = cleanTitle.replace(/\s*[-|:|•]\s*(Tata CLiQ|TataCLiQ|Tata Cliq).*/i, "").trim();
    }
    logger.info({ service: "scraper", event: "tatacliq_cleaned_title", cleanTitle });
    if (!cleanTitle) throw new Error("TataCliq: product title selector not found");

    // Extract price using robust browser-context multi-strategy parsing
    const price = await page.evaluate(() => {
      function cleanPrice(s) {
        if (!s) return null;
        let clean = String(s).trim();
        // Split on MRP/Off/Save/Discount/% to isolate selling price
        const parts = clean.split(/(?:MRP|mrp|Off|off|Save|save|Discount|discount|%)/i);
        if (parts.length > 0) clean = parts[0];
        // Strip trailing paise (.XX) — Indian prices don't use paise
        if (/\.\d{2}$/.test(clean)) {
          clean = clean.substring(0, clean.length - 3);
        } else if (/\.\d{1}$/.test(clean)) {
          clean = clean.substring(0, clean.length - 2);
        }
        const c = clean.replace(/[^0-9]/g, "");
        return c ? parseInt(c, 10) : null;
      }

      // Try most-specific selectors first (discount price = selling price)
      const priceSelectors = [
        ".ProductDetailsMainCard__discountPrice",
        ".ProductDetailsMainCard__price",
        ".ProductDescriptionPage__offerprice",
        ".final-price",
        '[class*="discountPrice"]',
        '[class*="price"]'
      ];
      for (const sel of priceSelectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText) {
          const val = cleanPrice(el.innerText);
          if (val && val > 0) return val;
        }
      }
      return null;
    });

    if (!price) throw new Error("TataCliq: price not found");

    // Extract brand
    let brand = "";
    const brandEl = await page.$(".brand-name") || await page.$('[class*="brand"]');
    if (brandEl) {
      brand = (await brandEl.textContent()).trim();
    }

    // Extract image URL
    let imageUrl = "";
    const imgEl = await page.$(".ProductImage img") || await page.$(".pdp-image img");
    if (imgEl) {
      imageUrl = await imgEl.getAttribute("src") || "";
    }

    // Availability — check for "Add To Bag" button
    const addToBagEl = await page.$('button:has-text("Add To Bag")') || await page.$('[class*="add-to-bag"]');
    const availability = addToBagEl ? "in_stock" : "out_of_stock";

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "tatacliq",
    });

    return { title: cleanTitle, price, brand, imageUrl, availability, platform: "tatacliq", url };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await releaseBrowser(browser);
  }
}

module.exports = { scrape };
