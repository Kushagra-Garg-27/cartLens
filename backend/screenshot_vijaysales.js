const { acquireBrowser, releaseBrowser, newStealthPage } = require("./src/scrapers/playwright.base");

async function run() {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);
    
    const url = "https://www.vijaysales.com/search/APPLE+iPhone+16";
    console.log("Going to Vijay Sales URL:", url);
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    console.log("DOM loaded, waiting 8 seconds...");
    await page.waitForTimeout(8000);
    
    await page.screenshot({ path: "vijaysales_debug2.png", fullPage: true });
    console.log("Screenshot saved to vijaysales_debug2.png");
    
    const html = await page.content();
    const count = (html.match(/iPhone 16/gi) || []).length;
    console.log(`Number of occurrences of 'iPhone 16' in page HTML: ${count}`);
    
    // Dump all links
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a"));
      return anchors.map(a => ({
        href: a.getAttribute("href") || "",
        text: a.innerText.replace(/\s+/g, ' ').trim().substring(0, 150),
      })).filter(item => item.href.length > 1);
    });
    
    console.log(`Total links found: ${links.length}`);
    const filtered = links.filter(l =>
      l.href.toLowerCase().includes("iphone") ||
      l.text.toLowerCase().includes("iphone") ||
      l.href.includes("/product/") ||
      l.href.includes("Buy-")
    );
    console.log(`Filtered links count: ${filtered.length}`);
    console.log(filtered.slice(0, 20));
  } catch (err) {
    console.error("FAILED:", err);
  } finally {
    if (page) await page.close();
    if (browser) await releaseBrowser(browser);
    process.exit(0);
  }
}

run();
