const { acquireBrowser, releaseBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

/**
 * Scrape Amazon.in product page.
 * @param {string} url
 * @returns {Promise<{ title: string, price: number, brand: string, modelNumber: string, availability: string, platform: string, url: string }>}
 */
async function scrape(url) {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Handle search URLs
    if (url.includes("/s?k=")) {
      const queryMatch = url.match(/[?&]k=([^&]+)/);
      const query = queryMatch ? decodeURIComponent(queryMatch[1]) : "";

      let candidates = [];
      
      // Try standard Amazon search page first
      try {
        await page.waitForSelector("div.s-card-container, div[data-component-type='s-search-result']", { timeout: 8000 }).catch(() => {});
        candidates = await page.evaluate(() => {
          const results = [];
          const items = document.querySelectorAll("div.s-card-container, div[data-component-type='s-search-result'], div[data-cy='asin-faceout-container']");
          for (const item of items) {
            let linkEl = item.querySelector("h2 a");
            if (!linkEl) {
              const allLinks = item.querySelectorAll("a");
              for (const a of allLinks) {
                const h = a.getAttribute("href") || "";
                if (h.includes("/dp/") || h.includes("/gp/")) { linkEl = a; break; }
              }
            }
            if (!linkEl) continue;

            const href = linkEl.getAttribute("href") || "";
            if (!href) continue;

            let titleText = "";
            const h2s = item.querySelectorAll("h2");
            for (const h2 of h2s) {
              const text = (h2.innerText || h2.textContent || "").trim();
              if (text.length > titleText.length) titleText = text;
            }
            if (!titleText) titleText = (linkEl.innerText || linkEl.textContent || "").trim();
            titleText = titleText.replace(/\s+/g, ' ').trim();

            if (href && titleText && !results.some(r => r.url === href)) {
              results.push({ url: href, title: titleText });
            }
          }
          return results.slice(0, 5);
        });
      } catch (err) {
        logger.warn({ service: "scraper", event: "amazon_search_fail", message: err.message });
      }

      // If standard search returned nothing (e.g. blocked with 503), use DuckDuckGo site search!
      if (!candidates || candidates.length === 0) {
        logger.info({ service: "scraper", event: "amazon_search_fallback_ddg", query });
        const { searchProductOnDDG } = require("./scraper.utils");
        candidates = await searchProductOnDDG(page, "amazon.in", query, "/dp/");
      }

      if (!candidates || candidates.length === 0) throw new Error("Amazon: No search results found");

      const { pickBestResult } = require("./scraper.utils");
      const bestProductUrl = pickBestResult(candidates, query);
      url = bestProductUrl.startsWith("http") ? bestProductUrl : "https://www.amazon.in" + bestProductUrl;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    // Extract title & price with User-Agent rotation retry loop
    let title = "";
    let priceText = "";
    const retries = 3;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (attempt > 1) {
          logger.info({
            service: "scraper",
            event: "amazon_pdp_retry",
            attempt,
            url
          });
          // Close old page, create fresh stealth page to rotate User-Agent
          if (page) await page.close().catch(() => {});
          page = await newStealthPage(browser);
          await page.waitForTimeout(2000 * attempt);
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        }

        const titleEl = await page.waitForSelector("#productTitle", { timeout: 10000 }).catch(() => null);
        if (!titleEl) {
          const isCaptcha = await page.evaluate(() => {
            return document.title.includes("Robot Check") || document.body.innerText.includes("Robot Check") || document.body.innerText.includes("CAPTCHA");
          });
          if (isCaptcha) {
            throw new Error("Amazon: Blocked by Robot Check CAPTCHA");
          }
          throw new Error("Amazon: #productTitle selector not found");
        }

        title = (await titleEl.textContent()).trim();

        priceText = await page.evaluate(() => {
          const selectors = [
            ".a-price-whole",
            "#priceblock_ourprice",
            "#priceblock_dealprice",
            ".a-price .a-offscreen",
            "span.a-size-medium.a-color-price",
            ".a-color-price",
            "#corePrice_desktop .a-price",
            "#corePriceDisplay_desktop_feature_div .a-price",
            "#apex_offerDisplay_desktop .a-price"
          ];
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) {
              const text = (el.innerText || el.textContent || "").trim();
              if (text && /[0-9]/.test(text)) return text;
            }
          }
          
          const metaSelectors = [
            'meta[name="twitter:data1"]',
            'meta[property="og:description"]',
            'meta[property="twitter:description"]'
          ];
          for (const sel of metaSelectors) {
            const el = document.querySelector(sel);
            if (el) {
              const content = el.getAttribute("content") || "";
              const match = content.match(/(?:Rs\.?|₹)\s*([0-9,.]+)/i);
              if (match) return match[0];
            }
          }

          const allEls = document.querySelectorAll("span, div, b, strong");
          let best = null;
          let bestLen = Infinity;
          for (const el of allEls) {
            if (el.children.length > 0) continue;
            const text = (el.innerText || el.textContent || "").trim();
            if (/^(?:₹|Rs\.?)\s*[\d,]+(?:\.\d{2})?$/i.test(text)) {
              const val = parseInt(text.replace(/[^0-9]/g, ""), 10);
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

        const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
        const isUnavailable = bodyText.includes("currently unavailable") || bodyText.includes("out of stock");

        if (!priceText && !isUnavailable) {
          throw new Error("Amazon: price selector not found");
        }
        break;
      } catch (err) {
        if (attempt === retries) throw err;
      }
    }

    const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
    const isUnavailable = bodyText.includes("currently unavailable") || bodyText.includes("out of stock");

    const price = priceText ? parsePrice(priceText) : 0;

    // Extract brand
    let brand = "";
    const brandEl = await page.$("#bylineInfo");
    if (brandEl) {
      brand = (await brandEl.textContent()).replace(/^(Visit the |Brand: )/, "").trim();
    }

    // Extract model number from spec table
    let modelNumber = "";
    const specRows = await page.$$("table.a-keyvalue tr, #productDetails_techSpec_section_1 tr");
    for (const row of specRows) {
      const label = await row.$("th, td:first-child");
      const value = await row.$("td:last-child");
      if (label && value) {
        const labelText = (await label.textContent()).trim().toLowerCase();
        if (labelText.includes("model") || labelText.includes("part number")) {
          modelNumber = (await value.textContent()).trim();
          break;
        }
      }
    }

    // Extract ASIN from URL
    let asin = "";
    const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/);
    if (asinMatch) asin = asinMatch[1];

    // Availability
    const availEl = await page.$("#availability span");
    const availText = availEl ? (await availEl.textContent()).trim().toLowerCase() : "";
    const availability = (availText.includes("in stock") && !isUnavailable) ? "in_stock" : "out_of_stock";

    // Extract bank offers and coupon codes from PDP
    const promoData = await page.evaluate(() => {
      const offers = [];
      const coupons = [];

      // Look for bank offers
      const vseOffers = document.querySelectorAll('#vse-offers-pills-container .a-carousel-card, [id*="vse-offers-"] .a-box-inner, .best-offers-items .a-list-item');
      vseOffers.forEach(el => {
        const text = el.innerText.replace(/\s+/g, ' ').trim();
        if (text.length > 5 && !offers.includes(text)) {
          offers.push(text);
        }
      });

      // General fallback semantic scan for bank cards
      const spans = document.querySelectorAll('span, a');
      spans.forEach(el => {
        const txt = el.innerText.trim();
        if (txt.includes("10% Instant Discount") || txt.includes("Bank Offer") || txt.includes("No Cost EMI")) {
          if (txt.length > 10 && txt.length < 150 && !offers.includes(txt)) {
            offers.push(txt);
          }
        }
      });

      // Look for coupons
      const couponTextEl = document.querySelector('.inline-coupon-label, [id*="couponText"], #applicableCoupons');
      if (couponTextEl) {
        const text = couponTextEl.innerText;
        const match = text.match(/Apply\s*₹?\s*(\d+)/i) || text.match(/Save\s*₹?\s*(\d+)/i) || text.match(/(\d+)%\s*coupon/i);
        if (match) {
          coupons.push({
            code: "AMZ_COUPON",
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
      platform: "amazon",
      bank_offers_count: promoData.offers.length,
      coupons_count: promoData.coupons.length,
    });

    return {
      title,
      price,
      brand,
      modelNumber,
      asin,
      availability,
      platform: "amazon",
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
