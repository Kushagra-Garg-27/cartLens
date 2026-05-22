const { acquireBrowser, releaseBrowser, newStealthPage } = require("./src/scrapers/playwright.base");

async function run() {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);

    const url = "https://www.vijaysales.com/content/vijaysaleswebsite/us/en/search-listing.html?q=APPLE+iPhone+16";
    console.log("Going to URL:", url);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    
    // Wait for skeleton loading to complete
    console.log("Waiting for product cards to render beyond skeleton...");
    await page.waitForSelector(".product-card:not(.skeleton)", { timeout: 15000 }).catch(() => {
      console.log("Still skeletons or timed out");
    });
    await page.waitForTimeout(3000);
    
    // Dump product cards
    const productData = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll(".product-card");
      for (const card of cards) {
        const isSkeleton = card.classList.contains("skeleton");
        const link = card.querySelector("a");
        const titleEl = card.querySelector(".product-card__title, [class*='title']");
        const priceEl = card.querySelector(".product-card__price, [class*='price']");
        results.push({
          isSkeleton,
          href: link?.getAttribute("href") || "",
          title: titleEl?.innerText?.replace(/\s+/g, ' ').trim().substring(0, 150) || "",
          price: priceEl?.innerText?.replace(/\s+/g, ' ').trim().substring(0, 80) || "",
          html: card.outerHTML.substring(0, 300)
        });
      }
      return results;
    });
    
    console.log(`Found ${productData.length} product cards`);
    const nonSkeleton = productData.filter(p => !p.isSkeleton);
    console.log(`Non-skeleton cards: ${nonSkeleton.length}`);
    console.log(nonSkeleton.slice(0, 5));
    
    if (nonSkeleton.length === 0) {
      console.log("All skeleton. Showing first 3 cards HTML:");
      console.log(productData.slice(0, 3));
    }
    
  } catch (err) {
    console.error("FAILED:", err);
  } finally {
    if (page) await page.close();
    if (browser) await releaseBrowser(browser);
    process.exit(0);
  }
}

run();
