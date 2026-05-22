const { acquireBrowser, releaseBrowser, newStealthPage } = require("./src/scrapers/playwright.base");

async function run() {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);
    
    console.log("Using page.request to fetch Croma API directly...");
    const url = "https://api.croma.com/product/allchannels/v1/search?currentPage=0&query=APPLE%20iPhone%2016:relevance&fields=FULL";
    
    const response = await page.request.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://www.croma.com",
        "Referer": "https://www.croma.com/",
        "Accept-Language": "en-IN,en;q=0.9"
      }
    });
    
    console.log("Response status:", response.status());
    if (response.ok()) {
      const data = await response.json();
      console.log("SUCCESS!");
      console.log("Data keys:", Object.keys(data));
      if (data.products) {
        console.log(`Found ${data.products.length} products!`);
        console.log("First product title:", data.products[0].name);
      }
    } else {
      const text = await response.text();
      console.log("Failed with status:", response.status());
      console.log("Body:", text.substring(0, 500));
    }
  } catch (err) {
    console.error("FAILED:", err.message);
  } finally {
    if (page) await page.close();
    if (browser) await releaseBrowser(browser);
    process.exit(0);
  }
}

run();
