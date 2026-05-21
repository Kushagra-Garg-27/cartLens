const { acquireBrowser, releaseBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

/**
 * SmartCompare Pro — Reliance Digital Scraper (Playwright)
 *
 * Scrapes Reliance Digital product pages for electronics.
 * Uses Playwright stealth + shared browser pool for reliable rendering.
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
      const queryMatch = url.match(/[?&]q=([^&]+)/);
      const query = queryMatch ? decodeURIComponent(queryMatch[1]) : "";

      await page.waitForSelector("a[href*='/p/']", { timeout: 15000 }).catch(() => {});
      
      const candidates = await page.evaluate(() => {
        const results = [];
        const links = document.querySelectorAll("a[href*='/p/']");
        for (const link of links) {
          const href = link.getAttribute("href") || "";
          
          let titleText = "";
          const parent = link.closest(".sp__product") || link.parentElement;
          if (parent) {
            const nameEl = parent.querySelector(".sp__name, .product-name, h3, h4");
            if (nameEl) titleText = nameEl.innerText || nameEl.textContent || "";
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

      if (!candidates || candidates.length === 0) throw new Error("Reliance Digital: No search results found");

      const { pickBestResult } = require("./scraper.utils");
      const bestProductUrl = pickBestResult(candidates, query);
      url = bestProductUrl.startsWith("http") ? bestProductUrl : "https://www.reliancedigital.in" + bestProductUrl;
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
