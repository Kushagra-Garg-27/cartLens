const { acquireBrowser, releaseBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

/**
 * SmartCompare Pro — Reliance Digital Scraper (Playwright)
 *
 * Scrapes Reliance Digital product pages for electronics.
 * Uses Playwright stealth + shared browser pool for reliable rendering.
 * 
 * Reliance Digital is a Vue.js SPA. Direct URL navigation to /search?q= returns 404.
 * Instead we:
 *   1. Navigate to the homepage first to bootstrap the SPA
 *   2. Use the search input to type the query and press Enter
 *   3. Wait for product cards to render
 *   4. Extract product links from the results (format: /product/...)
 */
async function scrape(url) {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);

    // Handle search URLs — use DuckDuckGo site-search to find Reliance Digital product pages
    if (url.includes("/search?q=") || url.includes("/products?q=") || url.includes("search?q=")) {
      const queryMatch = url.match(/[?&]q=([^&]+)/);
      const query = queryMatch ? decodeURIComponent(queryMatch[1].replace(/\+/g, ' ')) : "";

      logger.info({ service: "scraper", event: "reliancedigital_search_ddg", query });
      const { searchProductOnDDG } = require("./scraper.utils");
      const candidates = await searchProductOnDDG(page, "reliancedigital.in", query, "/product/");

      if (!candidates || candidates.length === 0) throw new Error("Reliance Digital: No search results found");

      const { pickBestResult } = require("./scraper.utils");
      const bestProductUrl = pickBestResult(candidates, query);
      if (!bestProductUrl) throw new Error("Reliance Digital: No good product matches found");
      
      const fullUrl = bestProductUrl.startsWith("http")
        ? bestProductUrl
        : "https://www.reliancedigital.in" + bestProductUrl;
      
      await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      url = fullUrl;
    } else {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    // Wait for the main content to load before extracting
    await page.waitForSelector(".pdp__product-name, h1.product-name, h1", { timeout: 10000 }).catch(() => {});

    // Extract title
    const titleEl = await page.$(".pdp__product-name") || await page.$("h1.product-name") || await page.$("h1");
    if (!titleEl) throw new Error("Reliance Digital: product title not found");
    const title = (await titleEl.textContent()).trim();

    // Extract price
    const priceEl = await page.$(".final-price") || await page.$(".pdp__offer-price") || await page.$('[class*="price"]');
    if (!priceEl) throw new Error("Reliance Digital: price element not found");
    const priceText = await priceEl.textContent();
    const price = parsePrice(priceText);

    // Extract brand
    let brand = "";
    const brandEl = await page.$(".pdp__brand-name") || await page.$('[class*="brand"]');
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
      platform: "reliancedigital",
    });

    return { title, price, brand, modelNumber, availability, platform: "reliancedigital", url };
  } catch (err) {
    throw new Error(`Reliance Digital scraper failed: ${err.message}`);
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await releaseBrowser(browser);
  }
}

module.exports = { scrape };
