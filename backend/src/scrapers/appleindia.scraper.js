const { acquireBrowser, releaseBrowser, newStealthPage, randomDelay, parsePrice } = require("./playwright.base");
const logger = require("../utils/logger");

async function scrape(url) {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Handle search/catalog URLs — if it's a landing or search page, resolve PDP URL first
    const isCatalog = url.includes("/search/") || url.includes("fh=") || url.includes("q=") || url.endsWith("/shop/buy-iphone") || url.endsWith("/shop/buy-iphone/");
    if (isCatalog) {
      // Extract the query for better matching
      const queryMatch = url.match(/[?&](?:q|fh)=([^&]+)/) || url.match(/\/search\/([^?]+)/);
      const query = queryMatch ? decodeURIComponent(queryMatch[1].replace(/\+/g, ' ')) : "";

      // Wait for dynamic card rendering
      await page.waitForTimeout(3000);
      
      const productUrl = await page.evaluate((searchQuery) => {
        // Prefer links containing the search query keywords
        const queryWords = searchQuery.toLowerCase().split(/[\s\-]+/).filter(w => w.length > 2);
        const allLinks = document.querySelectorAll("a.rf-serp-productname, .rf-serp-productname a, a[href*='/shop/buy-']");
        
        let bestLink = null;
        let bestScore = -1;
        
        for (const link of allLinks) {
          const href = (link.getAttribute("href") || "").toLowerCase();
          const text = (link.innerText || link.textContent || "").toLowerCase();
          
          // Skip generic landing pages that match the catalog URL
          if (href === "/in/shop/buy-iphone" || href === "/in/shop/buy-iphone/" || href.endsWith("/shop/buy-iphone") || href.endsWith("/shop/buy-iphone/")) continue;
          
          // Skip Mac links when searching for iPhone
          if (queryWords.some(w => w === "iphone") && (href.includes("buy-mac") || text.includes("mac"))) continue;
          
          let score = 0;
          for (const word of queryWords) {
            if (href.includes(word) || text.includes(word)) score++;
          }
          if (score > bestScore) {
            bestScore = score;
            bestLink = link.getAttribute("href");
          }
        }
        
        return bestLink;
      }, query);

      if (productUrl) {
        url = productUrl.startsWith("http") ? productUrl : "https://www.apple.com" + productUrl;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      }
    }

    // Wait for content to render
    await page.waitForTimeout(2000);

    // Extract title — prefer h1 over page title for accuracy
    let title = "";
    const titleEl = await page.$("h1");
    if (titleEl) {
      title = (await titleEl.textContent()).trim();
    }
    if (!title || title.toLowerCase() === "apple" || title.toLowerCase() === "apple (in)") {
      const pageTitle = await page.title();
      if (pageTitle) {
        title = pageTitle.trim();
        title = title.replace(/\s*[-|:|•]\s*(Apple).*/i, "");
        title = title.replace(/Buy\s+/i, "");
        title = title.replace(/\s+Online\s*(at\s*Best\s*Price.*)?/i, "");
        title = title.trim();
      }
    }
    if (!title || title.toLowerCase() === "apple" || title.toLowerCase() === "apple (in)") {
      title = "iPhone";
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
