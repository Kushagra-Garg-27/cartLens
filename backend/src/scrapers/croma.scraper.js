const { acquireBrowser, releaseBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

/**
 * Scrape Croma product page using Playwright stealth.
 * 
 * Croma's search API (api.croma.com) is protected by Akamai WAF which blocks
 * requests from headless browsers and non-browser clients with a 403. The SPA
 * search page fails to render products because the API call is blocked.
 *
 * Strategy:
 *   - For search URLs: Use Google site-search (site:croma.com) to find matching
 *     product page URLs, then scrape the product detail page directly.
 *   - For direct product URLs (/p/NUMBER): Scrape the PDP directly.
 */
async function scrape(url) {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);

    await randomDelay();

    // Handle search URLs — use DuckDuckGo site-search to find Croma product pages
    if ((url.includes("search?q=") || url.includes("search/?text=")) && url.includes("croma.com")) {
      const queryMatch = url.match(/[?&](?:q|text)=([^&]+)/);
      const query = queryMatch ? decodeURIComponent(queryMatch[1].replace(/\+/g, ' ')) : "";

      logger.info({ service: "scraper", event: "croma_search_ddg", query });
      const { searchProductOnDDG } = require("./scraper.utils");
      const candidates = await searchProductOnDDG(page, "croma.com", query, "/p/");

      if (!candidates || candidates.length === 0) throw new Error("Croma: No search results found");

      const { pickBestResult } = require("./scraper.utils");
      const bestProductUrl = pickBestResult(candidates, query);
      const fullUrl = bestProductUrl.startsWith("http")
        ? bestProductUrl
        : "https://www.croma.com" + bestProductUrl;
      await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      url = fullUrl;
    } else {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    // Wait for the page content to be available
    await page.waitForTimeout(3000);

    // Extract title — try multiple selectors for Croma's various PDP layouts
    const title = await page.evaluate(() => {
      const el =
        document.querySelector("h1") ||
        document.querySelector('[class*="product-name"]') ||
        document.querySelector('[class*="pdp-title"]');
      if (el) return el.innerText.trim();
      // Fallback: try meta tag
      const metaTitle = document.querySelector('meta[property="og:title"]');
      return metaTitle ? metaTitle.getAttribute("content")?.trim() : "";
    });
    if (!title) throw new Error("Croma: Could not extract product title");

    // Extract price — try class-based selectors, then semantic fallback
    const priceText = await page.evaluate(() => {
      // Strategy 1: known Croma price selectors
      const selectors = [
        '[class*="amount"]',
        '[class*="pdp-price"]',
        '[class*="new-price"]',
        '[class*="selling-price"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = el.innerText.trim();
          if (text && /₹|[0-9]/.test(text)) return text;
        }
      }
      // Strategy 2: meta tag
      const metaPrice = document.querySelector('meta[property="product:price:amount"]');
      if (metaPrice) return "₹" + metaPrice.getAttribute("content");
      // Strategy 3: semantic price discovery — find leaf elements with ₹ + digits
      const allEls = document.querySelectorAll("div,span,strong,p");
      let best = null;
      let bestLen = Infinity;
      for (const el of allEls) {
        if (el.children.length > 0) continue;
        const text = (el.innerText || "").trim();
        if (/^₹[\s\d,.]+$/.test(text)) {
          let cleaned = text;
          if (/\.\d{2}$/.test(cleaned)) {
            cleaned = cleaned.substring(0, cleaned.length - 3);
          } else if (/\.\d{1}$/.test(cleaned)) {
            cleaned = cleaned.substring(0, cleaned.length - 2);
          }
          const val = parseInt(cleaned.replace(/[^0-9]/g, ""), 10);
          if (!isNaN(val) && val > 100 && text.length < bestLen) {
            const style = window.getComputedStyle(el);
            if (style.textDecoration && style.textDecoration.includes("line-through")) continue;
            best = text;
            bestLen = text.length;
          }
        }
      }
      return best;
    });
    if (!priceText) throw new Error("Croma: Could not extract price");
    const price = parsePrice(priceText);

    // Extract model number from spec/details table
    const modelNumber = await page.evaluate(() => {
      const rows = document.querySelectorAll(
        '[class*="spec"] tr, [class*="detail"] tr, table tr, .specifications tr'
      );
      for (const row of rows) {
        const cells = row.querySelectorAll("td,th");
        for (let i = 0; i < cells.length; i++) {
          const label = (cells[i].textContent || "").trim().toLowerCase();
          if (label.includes("model") && cells[i + 1]) {
            return cells[i + 1].textContent.trim();
          }
        }
      }
      const items = document.querySelectorAll("li, [class*='spec'] div");
      for (const item of items) {
        const text = (item.textContent || "").trim();
        const match = text.match(/model\s*(?:number|no\.?|name)?\s*[:\-]\s*(.+)/i);
        if (match) return match[1].trim();
      }
      return "";
    });

    // Availability
    const outOfStock = await page.evaluate(() => {
      const el = document.querySelector('.out-of-stock, .sold-out, [class*="out-of-stock"]');
      return !!el;
    });
    const availability = outOfStock ? "out_of_stock" : "in_stock";

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "croma",
    });

    return { title, price, modelNumber, availability, platform: "croma", url };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await releaseBrowser(browser);
  }
}

module.exports = { scrape };
