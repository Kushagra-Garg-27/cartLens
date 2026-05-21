const { acquireBrowser, releaseBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

/**
 * Scrape Croma product page using Playwright stealth.
 * Croma uses Next.js SSR and rejects static crawlers, so JS rendering is required.
 * @param {string} url
 * @returns {Promise<Object>}
 */
async function scrape(url) {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);

    await randomDelay();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    // Handle search URLs — click through to the best product
    if (url.includes("search?q=") && url.includes("croma.com")) {
      const queryMatch = url.match(/[?&]q=([^&]+)/);
      const query = queryMatch ? decodeURIComponent(queryMatch[1]) : "";

      await page.waitForSelector('a[class*="product-"], a[class*="product-item"], .product-list a', { timeout: 15000 }).catch(() => {});

      const candidates = await page.evaluate(() => {
        const results = [];
        const anchors = document.querySelectorAll('a[class*="product-"], a[class*="product-item"], .product-list a, div[class*="product-item"] a');
        for (const a of anchors) {
          const h3 = a.querySelector("h3") || a.querySelector('[class*="title"]') || a;
          const href = a.getAttribute("href") || "";
          const titleText = h3 ? (h3.innerText || h3.textContent || "") : "";
          if (href && titleText.trim() && !results.some(r => r.url === href)) {
            results.push({ url: href, title: titleText.trim() });
          }
        }
        return results.slice(0, 3);
      });

      if (!candidates || candidates.length === 0) throw new Error("Croma: No search results found");

      const { pickBestResult } = require("./scraper.utils");
      const bestProductUrl = pickBestResult(candidates, query);
      const fullUrl = bestProductUrl.startsWith("http")
        ? bestProductUrl
        : "https://www.croma.com" + bestProductUrl;
      await page.goto(fullUrl, { waitUntil: "networkidle", timeout: 30000 });
      url = fullUrl;
    }

    // Wait for the page content to be available
    await page.waitForSelector("h1", { timeout: 10000 }).catch(() => {});

    // Extract title — updated selector chain for Croma's Next.js layout
    const title = await page.evaluate(() => {
      const el =
        document.querySelector("h1.sc-dkrFOg") ||
        document.querySelector('h1[class*="product-name"]') ||
        document.querySelector("h1");
      return el ? el.innerText.trim() : "";
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
      // Strategy 2: semantic price discovery — find leaf elements with ₹ + digits
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
      // Try spec table rows with "Model" label
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
      // Fallback: scan list items or divs with key-value structure
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
