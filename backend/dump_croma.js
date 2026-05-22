const { acquireBrowser, releaseBrowser, newStealthPage } = require("./src/scrapers/playwright.base");
const fs = require("fs");

async function run() {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);
    const url = "https://www.croma.com/search/?text=APPLE+iPhone+16";
    console.log("Going to URL:", url);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);
    const html = await page.content();
    fs.writeFileSync("croma_search_dump.html", html);
    console.log("Dumped HTML, length:", html.length);
    
    const anchors = await page.evaluate(() => {
      const results = [];
      const links = document.querySelectorAll("a");
      for (const a of links) {
        const href = a.getAttribute("href") || "";
        const text = (a.innerText || a.textContent || "").trim();
        const classes = a.className || "";
        if (href.includes("/p/") || href.includes("iphone-16")) {
          results.push({ href, text, classes });
        }
      }
      return results;
    });
    console.log("Matching a tags:", JSON.stringify(anchors.slice(0, 10), null, 2));
  } catch (err) {
    console.error("Error:", err);
  } finally {
    if (page) await page.close();
    if (browser) await releaseBrowser(browser);
    process.exit(0);
  }
}

run();
