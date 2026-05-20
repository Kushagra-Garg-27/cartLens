const { launchBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

/**
 * Scrape Amazon.in product page.
 * @param {string} url
 * @returns {Promise<{ title: string, price: number, brand: string, modelNumber: string, availability: string, platform: string, url: string }>}
 */
async function scrape(url) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await newStealthPage(browser);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Handle search URLs
    if (url.includes("/s?k=")) {
      const firstResult = await page.$("div[data-component-type='s-search-result'] h2 a");
      if (!firstResult) throw new Error("Amazon: No search results found");
      const productUrl = await firstResult.getAttribute("href");
      if (productUrl) {
        url = productUrl.startsWith("http") ? productUrl : "https://www.amazon.in" + productUrl;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      }
    }

    // Extract title
    const titleEl = await page.$("#productTitle");
    if (!titleEl) throw new Error("Amazon: #productTitle selector not found");
    const title = (await titleEl.textContent()).trim();

    // Extract price
    const priceEl = await page.$(".a-price-whole");
    if (!priceEl) throw new Error("Amazon: .a-price-whole selector not found");
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

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "amazon",
    });

    return { title, price, brand, modelNumber, asin, availability, platform: "amazon", url };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrape };
