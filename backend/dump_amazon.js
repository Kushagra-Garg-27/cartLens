const { acquireBrowser, releaseBrowser, newStealthPage } = require("./src/scrapers/playwright.base");
const fs = require("fs");

async function run() {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);
    const url = "https://www.amazon.in/s?k=APPLE+iPhone+16";
    console.log("Going to URL:", url);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);
    const html = await page.content();
    fs.writeFileSync("amazon_search_dump.html", html);
    console.log("Dumped HTML, length:", html.length);
    
    const elements = await page.evaluate(() => {
      const results = [];
      const titles = document.querySelectorAll("h2");
      for (const t of titles) {
        results.push(t.innerText || t.textContent);
      }
      return results;
    });
    console.log("Matching h2 elements:", JSON.stringify(elements.slice(0, 10), null, 2));
  } catch (err) {
    console.error("Error:", err);
  } finally {
    if (page) await page.close();
    if (browser) await releaseBrowser(browser);
    process.exit(0);
  }
}

run();
