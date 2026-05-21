const { launchBrowser, newStealthPage } = require("./src/scrapers/playwright.base");

async function diagnoseTataCliqFlow() {
  console.log("\n================ DIAGNOSING TATACLIQ FLOW ================");
  let browser;
  try {
    browser = await launchBrowser();
    const page = await newStealthPage(browser);
    const url = "https://www.tatacliq.com/search/?searchCategory=all&text=Vero+Moda";
    console.log("Navigating to search page:", url);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);
    
    console.log("Search Page Title:", await page.title());
    console.log("Search Page URL:", page.url());
    
    // Find matching link
    const productUrl = await page.evaluate(() => {
      const pdLink = document.querySelector('a[href*="/p-"]');
      return pdLink ? pdLink.getAttribute("href") : null;
    });
    console.log("Resolved product URL:", productUrl);
    
    if (productUrl) {
      const fullUrl = productUrl.startsWith("http") ? productUrl : "https://www.tatacliq.com" + productUrl;
      console.log("Navigating to PDP:", fullUrl);
      const res = await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(5000);
      
      console.log("PDP URL:", page.url());
      console.log("PDP Title:", await page.title());
      console.log("PDP HTML Content length:", await page.evaluate(() => document.body.innerHTML.length));
      
      const snippet = await page.evaluate(() => {
        const titleEl = document.querySelector(".ProductDetailsMainCard__productName") || document.querySelector("h1");
        return titleEl ? titleEl.outerHTML : "no h1 or productName found";
      });
      console.log("Header element details:", snippet);
    }
  } catch (err) {
    console.error("TataCliq diagnostic error:", err);
  } finally {
    if (browser) await browser.close();
  }
}

async function run() {
  await diagnoseTataCliqFlow();
}

run();
