const { acquireBrowser, releaseBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

async function scrape(url) {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Handle search/catalog URLs only if we don't already have price selectors directly on the page
    const hasPrice = await page.$(".rc-prices-fullprice, .as-price-currentprice");
    if (!hasPrice && (url.includes("/search/") || url.includes("/shop/buy-") || url.includes("fh=") || url.includes("q="))) {
      await page.waitForSelector("a[href*='/shop/buy-'], a.rf-serp-productname", { timeout: 15000 }).catch(() => {});
      
      const productUrl = await page.evaluate(() => {
        const link = document.querySelector(".rf-serp-productname a") || 
                     document.querySelector("a.rf-serp-productname") || 
                     document.querySelector("a[href*='/shop/buy-']");
        return link ? link.getAttribute("href") : null;
      });

      if (productUrl) {
        url = productUrl.startsWith("http") ? productUrl : "https://www.apple.com" + productUrl;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      }
    }

    // Wait for content to render
    await page.waitForTimeout(2000);

    const pageTitle = await page.title();
    let title = "";
    if (pageTitle) {
      title = pageTitle.trim();
      title = title.replace(/\s*[-|:|•]\s*(Apple).*/i, "");
      title = title.replace(/Buy\s+/i, "");
      title = title.replace(/\s+Online\s*(at\s*Best\s*Price.*)?/i, "");
      title = title.trim();
    }
    if (!title || title.toLowerCase() === "apple" || title.toLowerCase() === "apple (in)") {
      const titleEl = await page.$("h1");
      title = titleEl ? (await titleEl.textContent()).trim() : "iPhone";
    }

    const priceEl = await page.$(".rc-prices-fullprice, .as-price-currentprice, .rc-prices-currentprice, .rf-prices-currentprice, [data-autom='full-price'], [data-autom='current-price']");
    if (!priceEl) throw new Error("AppleIndia: price selector not found");
    const priceText = await priceEl.textContent();
    const price = parsePrice(priceText);

    // Extract image URL
    let imageUrl = "";
    const imgEl = await page.$(".rc-dimension-multiple-select-image img") || await page.$("img");
    if (imgEl) {
      imageUrl = await imgEl.getAttribute("src") || "";
    }

    logger.info({
      service: "scraper",
      event: "scrape_complete",
      platform: "appleindia",
    });

    return { title, price, brand: "Apple", modelNumber: "", availability: "in_stock", platform: "appleindia", url };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await releaseBrowser(browser);
  }
}

module.exports = { scrape };
