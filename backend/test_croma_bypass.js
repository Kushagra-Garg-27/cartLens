const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth");
chromium.use(stealth());

async function run() {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process"
      ],
    });
    
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      bypassCSP: true,
    });
    
    const page = await context.newPage();
    
    // Intercept requests to api.croma.com and modify headers / bypass blocks
    let apiResponseData = null;
    
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes("api.croma.com") && url.includes("/search")) {
        console.log(`API response intercepted: ${response.status()} ${url.substring(0, 100)}`);
        try {
          const body = await response.text();
          console.log(`API response body length: ${body.length}`);
          if (response.status() === 200) {
            apiResponseData = JSON.parse(body);
          }
        } catch (e) {
          console.log("Error reading response:", e.message);
        }
      }
    });
    
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes("api.croma.com") && url.includes("/search")) {
        console.log(`API request intercepted: ${request.method()} ${url.substring(0, 100)}`);
      }
    });

    const url = "https://www.croma.com/search/?text=APPLE+iPhone+16";
    console.log("Going to:", url);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    
    console.log("Waiting 10 seconds...");
    await page.waitForTimeout(10000);
    
    if (apiResponseData) {
      console.log("API data captured!");
      console.log("Products count:", apiResponseData.products?.length);
      if (apiResponseData.products?.length > 0) {
        console.log("First product:", apiResponseData.products[0].name);
      }
    } else {
      console.log("No API data captured. Trying to use route interception...");
      
      // Try using route interception to bypass CORS
      await context.route("**/api.croma.com/**", async (route) => {
        const request = route.request();
        const headers = {
          ...request.headers(),
          'Origin': 'https://www.croma.com',
          'Referer': 'https://www.croma.com/',
        };
        delete headers['sec-fetch-site'];
        delete headers['sec-fetch-mode'];
        const response = await route.fetch({ headers });
        await route.fulfill({ response });
      });
      
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(10000);
      
      if (apiResponseData) {
        console.log("API data captured on retry!");
        console.log("Products count:", apiResponseData.products?.length);
      } else {
        console.log("Still no API data.");
      }
    }

    await page.screenshot({ path: "croma_bypasscsp.png", fullPage: true });
    console.log("Screenshot saved");
    
  } catch (err) {
    console.error("FAILED:", err);
  } finally {
    if (browser) await browser.close();
    process.exit(0);
  }
}

run();
