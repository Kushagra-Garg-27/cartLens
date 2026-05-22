const { acquireBrowser, releaseBrowser, newStealthPage } = require("./src/scrapers/playwright.base");

async function run() {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);

    // Try going to a known Croma product page directly
    // Format: https://www.croma.com/apple-iphone-16-128gb-black-/p/302948
    const url = "https://www.croma.com/apple-iphone-16-128gb-black/p/302948";
    console.log("Going to direct Croma product page:", url);
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    console.log("DOM loaded, waiting 5s...");
    await page.waitForTimeout(5000);
    
    const title = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      return h1 ? h1.innerText.trim() : "NO H1 FOUND";
    });
    console.log("Title:", title);
    
    const priceText = await page.evaluate(() => {
      const selectors = ['[class*="amount"]', '[class*="pdp-price"]', '[class*="new-price"]', '[class*="selling-price"]'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = el.innerText.trim();
          if (text && /₹|[0-9]/.test(text)) return text;
        }
      }
      return "NO PRICE FOUND";
    });
    console.log("Price:", priceText);
    
    await page.screenshot({ path: "croma_product_page.png", fullPage: true });
    console.log("Screenshot saved");
    
  } catch (err) {
    console.error("FAILED:", err.message);
  } finally {
    if (page) await page.close();
    if (browser) await releaseBrowser(browser);
    process.exit(0);
  }
}

run();
