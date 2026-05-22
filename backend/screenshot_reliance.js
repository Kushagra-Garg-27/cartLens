const { acquireBrowser, releaseBrowser, newStealthPage } = require("./src/scrapers/playwright.base");

async function run() {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);
    const url = "https://www.reliancedigital.in/search?q=APPLE+iPhone+16";
    console.log("Going to Reliance URL:", url);
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    console.log("DOM loaded, waiting 8 seconds...");
    await page.waitForTimeout(8000);
    
    await page.screenshot({ path: "reliance_debug.png", fullPage: true });
    console.log("Screenshot saved to reliance_debug.png");
    
    const html = await page.content();
    const count = (html.match(/iPhone 16/gi) || []).length;
    console.log(`Number of occurrences of 'iPhone 16' in page HTML: ${count}`);
    
    // Find all links
    const candidates = await page.evaluate(() => {
      const results = [];
      const links = document.querySelectorAll("a");
      for (const a of links) {
        const href = a.getAttribute("href") || "";
        const text = a.innerText.trim();
        if (href.includes("/p/") || text.toLowerCase().includes("iphone")) {
          results.push({ href, text });
        }
      }
      return results;
    });
    
    console.log(`Found ${candidates.length} potential links:`);
    console.log(candidates.slice(0, 15));
  } catch (err) {
    console.error("Error:", err);
  } finally {
    if (page) await page.close();
    if (browser) await releaseBrowser(browser);
    process.exit(0);
  }
}

run();
