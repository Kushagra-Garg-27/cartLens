const { acquireBrowser, releaseBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

async function scrape(url) {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Handle search URLs
    if (url.includes("Search=") || url.includes("search=") || url.includes("/search/") || url.includes("q=")) {
      await page.waitForTimeout(2000);

      const queryMatch = url.match(/[?&]Search=([^&]+)/) || url.match(/[?&]search=([^&]+)/) || url.match(/[?&]q=([^&]+)/) || url.match(/\/search\/([^?\/]+)/);
      const query = queryMatch ? decodeURIComponent(queryMatch[1]) : "";

      const candidates = await page.evaluate(() => {
        const results = [];
        const knownSelectors = [
          'a[class*="product-card"]', '.product-listing a', '.product-item a', '.Productbox a',
          '.productList a', '.v-p-box a', '.product-tile a', '.product-container a',
          'a[href*="/product/"]', 'a[href*="/Buy-"]', 'a[href*="-Buy-"]', 'a[href*="Buy-"]'
        ];
        for (const sel of knownSelectors) {
          try {
            const els = document.querySelectorAll(sel);
            for (const el of els) {
              const href = el.getAttribute("href");
              if (href && (href.includes("/product/") || href.includes("Buy-") || href.includes("-Buy-"))) {
                const titleText = el.innerText || el.textContent || "";
                if (titleText.trim() && !results.some(r => r.url === href)) {
                  results.push({ url: href, title: titleText.trim() });
                }
              }
            }
          } catch (e) {}
        }
        
        if (results.length === 0) {
          const allLinks = document.querySelectorAll('a');
          for (const link of allLinks) {
            const href = link.getAttribute("href") || "";
            if (href.includes("/product/") || href.includes("Buy-") || href.includes("-Buy-")) {
              const titleText = link.innerText || link.textContent || "";
              if (titleText.trim() && !results.some(r => r.url === href)) {
                results.push({ url: href, title: titleText.trim() });
              }
            }
          }
        }
        return results.slice(0, 3);
      });

      if (!candidates || candidates.length === 0) throw new Error("VijaySales: No search results found");

      const { pickBestResult } = require("./scraper.utils");
      const bestProductUrl = pickBestResult(candidates, query);
      url = bestProductUrl.startsWith("http") ? bestProductUrl : "https://www.vijaysales.com" + bestProductUrl;
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
      (await page.$('[class*="product-price"]'));
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

    // Extract image URL
    let imageUrl = "";
    const imgEl = await page.$(".product-image img") || await page.$("img");
    if (imgEl) {
      imageUrl = await imgEl.getAttribute("src") || "";
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
