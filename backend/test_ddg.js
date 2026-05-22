const { acquireBrowser, releaseBrowser, newStealthPage } = require("./src/scrapers/playwright.base");

async function run() {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);

    const query = "APPLE iPhone 16";
    const ddgUrl = `https://html.duckduckgo.com/html/?q=site:reliancedigital.in+${encodeURIComponent(query)}`;
    console.log("Going to DDG URL:", ddgUrl);
    
    await page.goto(ddgUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    const html = await page.content();
    console.log("HTML length:", html.length);
    const title = await page.title();
    console.log("Page Title:", title);

    const candidates = await page.evaluate(() => {
      const results = [];
      const links = document.querySelectorAll("a");
      for (const link of links) {
        let href = link.getAttribute("href") || "";
        const titleText = link.innerText.replace(/\s+/g, ' ').trim();
        
        let realUrl = href;
        if (href.startsWith("//")) realUrl = "https:" + href;
        if (realUrl.includes("duckduckgo.com/l/?uddg=")) {
          const match = realUrl.match(/[?&]uddg=([^&]+)/);
          if (match) {
            realUrl = decodeURIComponent(match[1]);
          }
        }
        
        if (realUrl.includes("reliancedigital.in") && realUrl.includes("/product/")) {
          if (titleText && !results.some(r => r.url === realUrl)) {
            results.push({ url: realUrl, title: titleText });
          }
        }
      }
      return results;
    });

    console.log("Found decoded candidates on DDG:", candidates);

  } catch (err) {
    console.error("FAILED:", err.message);
  } finally {
    if (page) await page.close();
    if (browser) await releaseBrowser(browser);
    process.exit(0);
  }
}

run();
