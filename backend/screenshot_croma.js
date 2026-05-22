const { acquireBrowser, releaseBrowser, newStealthPage } = require("./src/scrapers/playwright.base");

async function run() {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);
    const url = "https://www.croma.com/search/?text=APPLE+iPhone+16";
    console.log("Going to URL:", url);
    
    // Capture page console logs
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    console.log("DOM loaded, waiting 8 seconds...");
    await page.waitForTimeout(8000);
    
    await page.screenshot({ path: "croma_debug.png", fullPage: true });
    console.log("Screenshot saved to croma_debug.png");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    if (page) await page.close();
    if (browser) await releaseBrowser(browser);
    process.exit(0);
  }
}

run();
