const { acquireBrowser, releaseBrowser, newStealthPage } = require("./src/scrapers/playwright.base");

async function run() {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);

    const query = "APPLE iPhone 16";
    const searchUrl = `https://www.vijaysales.com/content/vijaysaleswebsite/us/en/search-listing.html?q=${encodeURIComponent(query)}`;
    console.log("Going to VS Search Listing:", searchUrl);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    
    console.log("Waiting 6s for cards to render...");
    await page.waitForTimeout(6000);

    const cardsHtmlCount = await page.evaluate(() => {
      return document.querySelectorAll(".product-card").length;
    });
    console.log("Total product cards found:", cardsHtmlCount);

    const candidates = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll(".product-card");
      for (const card of cards) {
        const link = card.querySelector("a");
        const titleEl = card.querySelector(".product-card__title, [class*='title']");
        const href = link?.getAttribute("href") || "";
        const titleText = (titleEl?.innerText || "").replace(/\s+/g, ' ').trim();
        if (href && titleText) {
          results.push({ url: href, title: titleText });
        }
      }
      return results;
    });

    console.log("All candidates found:", candidates.slice(0, 10));

    await page.screenshot({ path: "vijaysales_debug.png", fullPage: true });
    console.log("Screenshot saved.");

  } catch (err) {
    console.error("FAILED:", err.message);
  } finally {
    if (page) await page.close();
    if (browser) await releaseBrowser(browser);
    process.exit(0);
  }
}

run();
