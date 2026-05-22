const { acquireBrowser, releaseBrowser, newStealthPage } = require("./src/scrapers/playwright.base");

async function run() {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);

    const url = "https://www.amazon.in/s?k=APPLE+iPhone+16";
    console.log("Going to Amazon Search:", url);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);

    const html = await page.content();
    console.log("HTML length:", html.length);
    console.log("Page Title:", await page.title());

    // Check if CAPTCHA page
    if (html.includes("captcha") || html.includes("robot") || html.includes("type the characters")) {
      console.log("DETECTED CAPTCHA ON AMAZON!");
    } else {
      console.log("No captcha detected on Amazon search page.");
    }

    await page.screenshot({ path: "amazon_debug.png", fullPage: true });
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
