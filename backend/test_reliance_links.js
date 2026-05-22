const { acquireBrowser, releaseBrowser, newStealthPage } = require("./src/scrapers/playwright.base");

async function run() {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);
    
    console.log("Going to Reliance Digital homepage...");
    await page.goto("https://www.reliancedigital.in/", { waitUntil: "domcontentloaded", timeout: 30000 });
    
    const searchInputSelector = "input#suggestionBox, input[placeholder*='Search'], input[aria-label*='Search']";
    await page.waitForSelector(searchInputSelector, { timeout: 15000 });
    await page.type(searchInputSelector, "APPLE iPhone 16");
    await page.keyboard.press("Enter");
    
    await page.waitForTimeout(8000);
    
    // Dump all links with their classes and texts
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a"));
      return anchors.map(a => ({
        href: a.getAttribute("href") || "",
        text: a.innerText.replace(/\s+/g, ' ').trim(),
        html: a.innerHTML.substring(0, 100)
      })).filter(item => item.href.length > 1);
    });
    
    console.log(`Total links found: ${links.length}`);
    
    // Let's filter links containing "iphone" or "49" (Reliance product IDs usually start with 49)
    const filtered = links.filter(l => l.href.toLowerCase().includes("iphone") || l.text.toLowerCase().includes("iphone") || l.href.includes("/p/"));
    console.log(`Filtered links count: ${filtered.length}`);
    console.log(filtered.slice(0, 40));
  } catch (err) {
    console.error("FAILED:", err);
  } finally {
    if (page) await page.close();
    if (browser) await releaseBrowser(browser);
    process.exit(0);
  }
}

run();
