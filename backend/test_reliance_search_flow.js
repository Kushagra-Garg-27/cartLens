const { acquireBrowser, releaseBrowser, newStealthPage } = require("./src/scrapers/playwright.base");

async function run() {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);
    
    console.log("Going to Reliance Digital homepage...");
    await page.goto("https://www.reliancedigital.in/", { waitUntil: "domcontentloaded", timeout: 30000 });
    
    console.log("Waiting for search input...");
    // Let's find any input of type search or text that could be the search box
    const searchInputSelector = "input#suggestionBox, input[placeholder*='Search'], input[aria-label*='Search']";
    await page.waitForSelector(searchInputSelector, { timeout: 15000 });
    
    console.log("Typing query...");
    await page.type(searchInputSelector, "APPLE iPhone 16");
    await page.keyboard.press("Enter");
    
    console.log("Waiting 10 seconds for results to load...");
    await page.waitForTimeout(10000);
    
    await page.screenshot({ path: "reliance_search_flow.png", fullPage: true });
    console.log("Screenshot saved to reliance_search_flow.png");
    
    const html = await page.content();
    const count = (html.match(/iPhone 16/gi) || []).length;
    console.log(`Number of occurrences of 'iPhone 16' in page HTML: ${count}`);
    
    // Check if there are any products
    const candidates = await page.evaluate(() => {
      const results = [];
      const links = document.querySelectorAll("a");
      for (const a of links) {
        const href = a.getAttribute("href") || "";
        const text = a.innerText.trim();
        if (href.includes("/p/") && text.toLowerCase().includes("iphone")) {
          results.push({ href, text });
        }
      }
      return results;
    });
    
    console.log(`Found ${candidates.length} search product link candidates!`);
    if (candidates.length > 0) {
      console.log("Sample candidates:", candidates.slice(0, 5));
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
