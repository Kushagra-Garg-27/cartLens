const { launchBrowser, newStealthPage } = require("./playwright.base");

async function run() {
  const url = "https://www.flipkart.com/lava-bold-n1-5g-champagne-gold-128-gb/p/itm69169cee19adf?pid=MOBHN9GY5XWYY5AC";
  let browser;
  try {
    console.log("Launching browser...");
    browser = await launchBrowser();
    const page = await newStealthPage(browser);
    console.log("Navigating to:", url);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    const metadata = await page.evaluate(() => {
      const metas = Array.from(document.querySelectorAll("meta")).map(m => {
        const attrs = {};
        for (const attr of m.attributes) {
          attrs[attr.name] = attr.value;
        }
        return attrs;
      });
      
      const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s => {
        try {
          return JSON.parse(s.textContent);
        } catch(e) {
          return s.textContent;
        }
      });
      
      return { metas, jsonLd };
    });

    console.log("META TAGS:");
    console.log(JSON.stringify(metadata.metas.filter(m => m.name || m.property || m.itemprop), null, 2));

    console.log("\nJSON-LD SCRIPTS:");
    console.log(JSON.stringify(metadata.jsonLd, null, 2));

  } catch (err) {
    console.error("Error running test:", err);
  } finally {
    if (browser) await browser.close();
    process.exit();
  }
}

run();
