const { acquireBrowser, releaseBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

/**
 * Vijay Sales Scraper (Playwright)
 *
 * Vijay Sales uses Unbxd-powered search with client-side rendering.
 * Search URL: /content/vijaysaleswebsite/us/en/search-listing.html?q=QUERY
 * Product URL: /p/SKU/product-slug
 * Product cards use .product-card class with data attributes for price/brand/stock.
 */
async function scrape(url) {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);

    // Handle search URLs — translate to the working search-listing format
    if (url.includes("Search=") || url.includes("search=") || url.includes("/search/") || url.includes("q=") || url.includes("search-listing")) {
      let query = "";
      const queryMatch = url.match(/[?&](?:Search|search|q)=([^&]+)/) || url.match(/\/search\/([^?\/]+)/);
      query = queryMatch ? decodeURIComponent(queryMatch[1].replace(/\+/g, ' ')) : "";

      let candidates = [];
      try {
        // Use the actual working search URL format
        const searchUrl = `https://www.vijaysales.com/content/vijaysaleswebsite/us/en/search-listing.html?q=${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

        // Wait for product cards to render past skeleton state
        await page.waitForSelector(".product-card:not(.skeleton)", { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(3000);

        candidates = await page.evaluate(() => {
          const results = [];
          const cards = document.querySelectorAll(".product-card.show, .product-card:not(.skeleton)");
          for (const card of cards) {
            const link = card.querySelector("a");
            const titleEl = card.querySelector(".product-card__title, [class*='title']");
            const href = link?.getAttribute("href") || "";
            const titleText = (titleEl?.innerText || "").replace(/\s+/g, ' ').trim();
            if (href && titleText && !results.some(r => r.url === href)) {
              results.push({ url: href, title: titleText });
            }
          }
          return results.slice(0, 5);
        });
      } catch (err) {
        logger.warn({ service: "scraper", event: "vijaysales_search_fail", message: err.message });
      }

      // Check if standard search is low-quality or empty (e.g. no products matched > 0.2 score)
      const { pickBestResult, searchProductOnDDG } = require("./scraper.utils");
      let bestProductUrl = null;
      if (candidates && candidates.length > 0) {
        // Let's see if we get a good match
        const { tokenize } = require("../utils/text.utils");
        const queryTokens = new Set(tokenize(query));
        let maxScore = 0;
        for (const c of candidates) {
          const titleTokens = new Set(tokenize(c.title));
          const intersection = [...queryTokens].filter(t => titleTokens.has(t));
          const union = new Set([...queryTokens, ...titleTokens]);
          const score = intersection.length / union.size;
          if (score > maxScore) maxScore = score;
        }
        
        // If max match score is decent, we use the results
        if (maxScore > 0.2) {
          bestProductUrl = pickBestResult(candidates, query);
        }
      }

      if (!bestProductUrl) {
        logger.info({ service: "scraper", event: "vijaysales_search_fallback_ddg", query });
        candidates = await searchProductOnDDG(page, "vijaysales.com", query, "/p/");
        if (!candidates || candidates.length === 0) throw new Error("VijaySales: No search results found");
        bestProductUrl = pickBestResult(candidates, query);
      }

      url = bestProductUrl.startsWith("http") ? bestProductUrl : "https://www.vijaysales.com" + bestProductUrl;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    } else {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    // Wait for the main content to load before extracting
    await page.waitForSelector("h1", { timeout: 10000 });

    const titleEl = await page.$("h1");
    const title = titleEl ? (await titleEl.textContent()).trim() : "Unknown Title";

    // Extract price
    const priceEl =
      (await page.$('[itemprop="price"]')) ||
      (await page.$('[class*="special-price"]')) ||
      (await page.$('[class*="product-price"]')) ||
      (await page.$('[class*="price"]'));
    if (!priceEl) throw new Error("VijaySales: price element not found");
    const priceText = await priceEl.textContent();
    const price = parsePrice(priceText);

    // Extract brand
    let brand = "";
    const brandEl = await page.$('[itemprop="brand"]') || await page.$('[class*="brand"]');
    if (brandEl) {
      brand = (await brandEl.textContent()).trim();
    }

    // Extract model number from spec table
    let modelNumber = "";
    const specRows = await page.$$("table tr, .specifications tr, .spec-row, tr");
    for (const row of specRows) {
      const label = await row.$("td:first-child, th");
      const value = await row.$("td:last-child");
      if (label && value) {
        const labelText = (await label.textContent()).trim().toLowerCase();
        if (labelText.includes("model") || labelText.includes("part number")) {
          modelNumber = (await value.textContent()).trim();
          break;
        }
      }
    }

    // Availability
    const pageContent = await page.textContent("body");
    let availability = "in_stock";
    if (
      pageContent.includes("OUT OF STOCK") || 
      pageContent.includes("Notify Me") || 
      pageContent.includes("Sold Out") ||
      pageContent.includes("Out Of Stock") ||
      pageContent.includes("Sold out")
    ) {
      availability = "out_of_stock";
    }

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "vijaysales",
    });

    return { title, price, brand, modelNumber, availability, platform: "vijaysales", url };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await releaseBrowser(browser);
  }
}

module.exports = { scrape };
