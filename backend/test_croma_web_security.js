const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth");
chromium.use(stealth());

async function run() {
  let browser;
  try {
    console.log("Launching browser with --disable-web-security...");
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-web-security"],
    });
    
    const page = await browser.newPage({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });
    
    const url = "https://www.croma.com/search/?text=APPLE+iPhone+16";
    console.log("Going to Croma search URL:", url);
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    
    console.log("DOM loaded, waiting 8 seconds for client-side API fetch...");
    await page.waitForTimeout(8000);
    
    const html = await page.content();
    const count = (html.match(/iPhone 16/gi) || []).length;
    console.log(`Number of occurrences of 'iPhone 16' in page HTML: ${count}`);
    
    const candidates = await page.evaluate(() => {
      const results = [];
      const anchors = document.querySelectorAll('a[class*="product-"], a[class*="product-item"], .product-list a, div[class*="product-item"] a');
      for (const a of anchors) {
        const h3 = a.querySelector("h3") || a.querySelector('[class*="title"]') || a;
        const href = a.getAttribute("href") || "";
        const titleText = h3 ? (h3.innerText || h3.textContent || "") : "";
        if (href && titleText.trim()) {
          results.push({ url: href, title: titleText.trim() });
        }
      }
      return results;
    });
    
    console.log(`Found ${candidates.length} search product link candidates!`);
    if (candidates.length > 0) {
      console.log("First candidate:", candidates[0]);
    }
    
  } catch (err) {
    console.error("FAILED:", err);
  } finally {
    if (browser) await browser.close();
    process.exit(0);
  }
}

run();
