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

      await page.waitForSelector("div[data-component-type='s-search-result']", { timeout: 15000 }).catch(() => {});

      const candidates = await page.evaluate(() => {
        const results = [];
        const items = document.querySelectorAll("div[data-component-type='s-search-result']");
        for (const item of items) {
          const linkEl = item.querySelector("h2 a");
          const titleEl = item.querySelector(".a-text-normal") || item.querySelector("h2 span");
          if (linkEl && titleEl) {
            const href = linkEl.getAttribute("href") || "";
            const titleText = titleEl.innerText || titleEl.textContent || "";
            if (href && titleText.trim() && !results.some(r => r.url === href)) {
              results.push({ url: href, title: titleText.trim() });
            }
          }
        }
        return results.slice(0, 3);
      });

      if (!candidates || candidates.length === 0) throw new Error("Amazon: No search results found");

      const { pickBestResult } = require("./scraper.utils");
      const bestProductUrl = pickBestResult(candidates, query);
      url = bestProductUrl.startsWith("http") ? bestProductUrl : "https://www.amazon.in" + bestProductUrl;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    // Extract title
    const titleEl = await page.$("#productTitle");
    if (!titleEl) throw new Error("Amazon: #productTitle selector not found");
    const title = (await titleEl.textContent()).trim();

    // Extract price
    let priceEl = await page.$(".a-price-whole");
    if (!priceEl) {
      priceEl = await page.$("#corePriceDisplay_desktop_feature_div .a-price");
    }
    if (!priceEl) {
      priceEl = await page.$("#apex_offerDisplay_desktop .a-price");
    }
    if (!priceEl) throw new Error("Amazon: price selector not found");
    const priceText = await priceEl.textContent();
    const price = parsePrice(priceText);

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
    const availability = availText.includes("in stock") ? "in_stock" : "out_of_stock";

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
