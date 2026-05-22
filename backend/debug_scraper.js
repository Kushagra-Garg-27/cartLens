const { acquireBrowser, releaseBrowser, newStealthPage, randomDelay } = require("./src/scrapers/playwright.base");
const fs = require("fs");
const path = require("path");

async function debugUrl(name, url) {
  console.log(`\n--- DEBUGGING ${name} ---`);
  console.log(`URL: ${url}`);
  let browser;
  let page;
  try {
    browser = await acquireBrowser();
    page = await newStealthPage(browser);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000); // Wait 5s for JS execution

    const title = await page.title();
    console.log(`Page Title: "${title}"`);

    const bodyLength = await page.evaluate(() => document.body.innerText.length);
    console.log(`Body text length: ${bodyLength}`);

    // Log first 300 chars of body text to see if there's a captcha/block
    const bodyTextSnippet = await page.evaluate(() => document.body.innerText.substring(0, 300));
    console.log(`Body text snippet:\n"${bodyTextSnippet.replace(/\n+/g, ' ')}"\n`);

    // Let's print some HTML anchors / links
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a"));
      return anchors.map(a => ({
        href: a.getAttribute("href"),
        text: (a.innerText || "").trim(),
        className: a.className
      })).filter(a => a.href && a.text).slice(0, 10);
    });
    console.log("Found links snippet:", JSON.stringify(links, null, 2));

    // Capture screenshot to artifact dir so we can view it
    const screenshotName = `${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_debug.png`;
    const screenshotPath = path.join(__dirname, screenshotName);
    await page.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved to: ${screenshotPath}`);

  } catch (err) {
    console.error(`Error debugging ${name}:`, err.message);
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await releaseBrowser(browser);
  }
}

async function run() {
  await debugUrl("Amazon", "https://www.amazon.in/s?k=APPLE+iPhone+16");
  await debugUrl("Croma", "https://www.croma.com/search/?text=APPLE+iPhone+16");
  await debugUrl("RelianceDigital", "https://www.reliancedigital.in/search?q=APPLE+iPhone+16");
  await debugUrl("VijaySales", "https://www.vijaysales.com/search/APPLE+iPhone+16");
  process.exit(0);
}

run();
