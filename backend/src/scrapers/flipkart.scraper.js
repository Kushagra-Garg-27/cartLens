const { acquireBrowser, releaseBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

/**
 * Scrape Flipkart product page.
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
    if (url.includes("/search?q=")) {
      // Wait for search results to load
      await page.waitForSelector("a[href*='/p/']", { timeout: 15000 }).catch(() => {});
      
      const queryMatch = url.match(/[?&]q=([^&]+)/);
      const query = queryMatch ? decodeURIComponent(queryMatch[1]) : "";

      const candidates = await page.evaluate(() => {
        const results = [];
        const knownSelectors = [
          "a.CGtC98", "a.VJA3hP", "a._1fQZEK", "a.IRpwTa", "a.wjcEIp",
          "a._2rpwqI", "a.s1Q9rs", "div[data-id] a[href*='/p/']"
        ];
        
        for (const sel of knownSelectors) {
          try {
            const els = document.querySelectorAll(sel);
            for (const el of els) {
              if (el && el.href && el.href.includes("/p/")) {
                const titleText = el.innerText || el.textContent || "";
                const href = el.getAttribute("href") || "";
                if (href && titleText.trim() && !results.some(r => r.url === href)) {
                  results.push({ url: href, title: titleText.trim() });
                }
              }
            }
          } catch (e) {}
        }

        const allLinks = document.querySelectorAll('a[href*="/p/"]');
        for (const link of allLinks) {
          const href = link.getAttribute("href") || "";
          const titleText = link.innerText || link.textContent || "";
          if (href && titleText.trim() && !results.some(r => r.url === href)) {
            results.push({ url: href, title: titleText.trim() });
          }
        }
        return results.slice(0, 3);
      });

      if (!candidates || candidates.length === 0) throw new Error("Flipkart: No search results found");

      const { pickBestResult } = require("./scraper.utils");
      const bestProductUrl = pickBestResult(candidates, query);
      url = bestProductUrl.startsWith("http") ? bestProductUrl : "https://www.flipkart.com" + bestProductUrl;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    // Close login popup if present
    const closeBtn = await page.$("button._2KpZ6l._2doB4z");
    if (closeBtn) await closeBtn.click();

    // Extract title — robust fallback chain
    const titleEl = await page.evaluate(() => {
      const el = document.querySelector('.B_NuCI') || 
                 document.querySelector('.yhB1nd') || 
                 document.querySelector('h1._9E25nV') || 
                 document.querySelector('h1 span') || 
                 document.querySelector('h1');
      if (el && el.innerText.trim()) return el.innerText.trim();
      const ogEl = document.querySelector('meta[property="og:title"]');
      return ogEl ? ogEl.getAttribute("content") : document.title;
    });
    if (!titleEl) throw new Error("Flipkart: title selector not found");
    const title = titleEl;
 
    // Extract price — multi-strategy robust fallback, prioritizing JSON-LD first, then title proximity
    const priceResult = await page.evaluate(() => {
      // 1. JSON-LD Extraction
      function findProductInJsonLd(obj) {
        if (!obj) return null;
        if (Array.isArray(obj)) {
          for (var i = 0; i < obj.length; i++) {
            var res = findProductInJsonLd(obj[i]);
            if (res) return res;
          }
        } else if (typeof obj === 'object') {
          if (obj['@type'] === 'Product' || (typeof obj['@type'] === 'string' && obj['@type'].indexOf('Product') >= 0)) {
            return obj;
          }
          if (obj['@graph']) {
            return findProductInJsonLd(obj['@graph']);
          }
          for (var key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              var res = findProductInJsonLd(obj[key]);
              if (res) return res;
            }
          }
        }
        return null;
      }

      function cleanPrice(s) {
        if (!s) return null;
        let clean = String(s).trim();
        if (/\.\d{2}$/.test(clean)) {
          clean = clean.substring(0, clean.length - 3);
        } else if (/\.\d{1}$/.test(clean)) {
          clean = clean.substring(0, clean.length - 2);
        }
        const c = clean.replace(/[^0-9]/g, "");
        return c ? parseInt(c, 10) : null;
      }

      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (let i = 0; i < scripts.length; i++) {
        try {
          const data = JSON.parse(scripts[i].textContent);
          const product = findProductInJsonLd(data);
          if (product && product.offers) {
            const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
            for (let k = 0; k < offers.length; k++) {
              const offer = offers[k];
              const pVal = offer.price || offer.lowPrice || offer.highPrice;
              if (pVal) {
                const parsed = cleanPrice(pVal);
                if (parsed && parsed > 100) return { price: parsed, via: "json-ld" };
              }
            }
          }
        } catch (e) {}
      }

      // 2. Proximity-to-Title Selector Search
      const titleElement = document.querySelector('.B_NuCI') || document.querySelector('.yhB1nd') || document.querySelector('h1._9E25nV') || document.querySelector('h1');
      if (titleElement) {
        let parent = titleElement.parentElement;
        for (let depth = 0; depth < 4 && parent; depth++) {
          const priceSelectors = [
            '.Nx9bqj.CxhGGd', '.Nx9bqj', '._30jeq3._16Jk6d', '._30jeq3',
            'div[class*="CxhGGd"]', 'div[class*="Nx9bqj"]', 'div[class*="v1zwn20"]',
            'div[class*="_30jeq3"]', 'div[class*="_16Jk6d"]'
          ];
          for (const sel of priceSelectors) {
            const priceEl = parent.querySelector(sel);
            if (priceEl && priceEl.innerText) {
              try {
                const style = window.getComputedStyle(priceEl);
                if (style && style.textDecoration && style.textDecoration.includes('line-through')) continue;
              } catch(e) {}
              const parsed = cleanPrice(priceEl.innerText);
              if (parsed && parsed > 100) {
                return { price: parsed, via: "selector" };
              }
            }
          }
          parent = parent.parentElement;
        }
      }

      // 3. Global price selectors
      const selectors = [
        '._30jeq3._16Jk6d', '._16Jk6d', '.Nx9bqj.CxhGGd',
        '.CEmiEU .Nx9bqj', '._25b18c ._30jeq3',
        'div[class*="CxhGGd"]', 'div[class*="Nx9bqj"]', 'div[class*="v1zwn20"]',
        'div[class*="_30jeq3"]', 'div[class*="_16Jk6d"]',
        'span[class*="CxhGGd"]', 'span[class*="Nx9bqj"]',
        '[class*="price"] [class*="30jeq"]'
      ];
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (el && el.innerText) {
            try {
              const style = window.getComputedStyle(el);
              if (style && style.textDecoration && style.textDecoration.includes('line-through')) continue;
            } catch(e) {}
            const parsed = cleanPrice(el.innerText);
            if (parsed && parsed > 100) return { price: parsed, via: "selector" };
          }
        } catch (e) {}
      }

      // 4. Meta tag fallback
      try {
        const metaEl = document.querySelector('meta[itemprop="price"], [itemprop="price"]');
        if (metaEl) {
          const val = metaEl.getAttribute('content') || metaEl.innerText;
          const parsed = cleanPrice(val);
          if (parsed && parsed > 100) return { price: parsed, via: "meta" };
        }
      } catch (e) {}

      // 5. Semantic Scan
      const allEls = document.querySelectorAll('div,span,strong');
      let bestVal = null;
      let bestLen = Infinity;
      for (const el of allEls) {
        if (!el || !el.innerText || (el.children && el.children.length > 2)) continue;
        const txt = el.innerText.trim();
        if (txt.length > 20 || txt.length < 2) continue;
        if (/^₹[\s\d,.]+$/.test(txt) || /\u20b9\s*[\d,]+/.test(txt)) {
          try {
            const style = window.getComputedStyle(el);
            if (style && style.textDecoration && style.textDecoration.includes('line-through')) continue;
          } catch (e) {}
          const parsed = cleanPrice(txt);
          if (parsed && parsed > 100 && parsed < 10000000 && txt.length < bestLen) {
            bestVal = parsed;
            bestLen = txt.length;
          }
        }
      }
      if (bestVal) return { price: bestVal, via: "regex" };

      return null;
    });

    if (!priceResult || !priceResult.price) throw new Error("Flipkart: price selector not found");
    const price = priceResult.price;

    // Extract brand
    let brand = "";
    const brandEl = await page.$("._2WkVRV");
    if (brandEl) {
      brand = (await brandEl.textContent()).trim();
    }

    // Extract Flipkart PID from URL
    let flipkartPid = "";
    const pidMatch = url.match(/\/p\/itm([A-Z0-9]+)/i);
    if (pidMatch) flipkartPid = pidMatch[1];

    // Availability
    const outOfStockEl = await page.$("._16FRp0");
    const availability = outOfStockEl ? "out_of_stock" : "in_stock";

    // Extract bank offers and coupon codes
    const promoData = await page.evaluate(() => {
      const offers = [];
      const coupons = [];

      // Flipkart available offers items
      const offerEls = document.querySelectorAll('li.xhdCw5, li.r21K1q, li[class*="xhdCw5"], li[class*="r21K1q"]');
      offerEls.forEach(el => {
        const text = el.innerText.replace(/\s+/g, ' ').trim();
        if (text.length > 5 && !offers.includes(text)) {
          offers.push(text);
        }
      });

      // Semantic search for offers
      const spans = document.querySelectorAll('span');
      spans.forEach(el => {
        const txt = el.innerText.trim();
        if (txt.includes("Bank Offer") || txt.includes("Instant Discount") || txt.includes("Cashback")) {
          if (txt.length > 10 && txt.length < 150 && !offers.includes(txt)) {
            offers.push(txt);
          }
        }
      });

      // Flipkart coupons
      const couponEl = document.querySelector('div[class*="coupon"], span[class*="coupon"]');
      if (couponEl) {
        const text = couponEl.innerText;
        const match = text.match(/Apply\s*₹?\s*(\d+)/i) || text.match(/Save\s*₹?\s*(\d+)/i) || text.match(/(\d+)%\s*Off/i);
        if (match) {
          coupons.push({
            code: "FK_COUPON",
            text: text.replace(/\s+/g, ' ').trim(),
            discount: parseInt(match[1], 10),
            isPercent: text.includes("%")
          });
        }
      }

      return { offers: offers.slice(0, 5), coupons };
    });

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "flipkart",
      bank_offers_count: promoData.offers.length,
      coupons_count: promoData.coupons.length,
    });

    return {
      title,
      price,
      brand,
      flipkartPid,
      availability,
      platform: "flipkart",
      url,
      bankOffers: promoData.offers,
      couponCodes: promoData.coupons
    };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await releaseBrowser(browser);
  }
}

module.exports = { scrape };
