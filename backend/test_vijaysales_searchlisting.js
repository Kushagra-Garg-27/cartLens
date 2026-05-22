const { acquireBrowser, releaseBrowser, newStealthPage } = require("./src/scrapers/playwright.base");

async function run() {
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);

    // Try the search-listing URL format we found in their SPA
    const url = "https://www.vijaysales.com/content/vijaysaleswebsite/us/en/search-listing.html?q=APPLE+iPhone+16";
    console.log("Going to URL:", url);

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    console.log("DOM loaded, waiting 8 seconds...");
    await page.waitForTimeout(8000);

    await page.screenshot({ path: "vijaysales_searchlisting.png", fullPage: true });
    console.log("Screenshot saved");

    const html = await page.content();
    const count = (html.match(/iPhone/gi) || []).length;
    console.log(`Number of occurrences of 'iPhone' in page HTML: ${count}`);

    // Dump all links with /product/ or /Buy-
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a"));
      return anchors.map(a => ({
        href: a.getAttribute("href") || "",
        text: a.innerText.replace(/\s+/g, ' ').trim().substring(0, 120),
      })).filter(item => {
        const h = item.href.toLowerCase();
        return h.includes("/product/") || h.includes("buy-") || h.includes("iphone");
      });
    });

    console.log(`Filtered links count: ${links.length}`);
    console.log(links.slice(0, 20));
  } catch (err) {
    console.error("FAILED:", err);
  } finally {
    if (page) await page.close();
    if (browser) await releaseBrowser(browser);
    process.exit(0);
  }
}

run();
