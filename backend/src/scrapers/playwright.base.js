const logger = require("../utils/logger");

let chromium;
let stealth;

try {
  chromium = require("playwright-extra").chromium;
  stealth = require("puppeteer-extra-plugin-stealth");
  chromium.use(stealth());
} catch (err) {
  logger.warn({
    service: "scraper",
    event: "playwright_not_available",
    message: "Playwright/stealth not installed — scrapers will fail gracefully",
  });
}

/**
 * Launch a stealth Chromium browser.
 * @returns {Promise<import("playwright").Browser>}
 */
async function launchBrowser() {
  if (!chromium) {
    throw new Error("Playwright is not installed. Run: npx playwright install chromium");
  }
  return chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
}

/**
 * Create a new stealth page with randomized viewport and Indian locale.
 * @param {import("playwright").Browser} browser
 * @returns {Promise<import("playwright").Page>}
 */
async function newStealthPage(browser) {
  const config = require("../config");
  const agents = config.scraper.userAgentPool;
  const ua = agents.length > 0
    ? agents[Math.floor(Math.random() * agents.length)]
    : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  const page = await browser.newPage();
  await page.setViewportSize({
    width: Math.floor(Math.random() * 720) + 1200,
    height: Math.floor(Math.random() * 380) + 700,
  });
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-IN,en;q=0.9" });
  await page.emulateMedia({ locale: "en-IN", timezoneId: "Asia/Kolkata" });
  return page;
}

/**
 * Random delay between min and max ms.
 * @returns {Promise<void>}
 */
async function randomDelay() {
  const config = require("../config");
  const min = config.scraper.minDelayMs;
  const max = config.scraper.maxDelayMs;
  const delay = Math.floor(Math.random() * (max - min)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Parse Indian price format (₹1,23,456) to number.
 * @param {string} priceStr
 * @returns {number}
 */
function parsePrice(priceStr) {
  if (!priceStr) throw new Error("Price string is empty or null");
  const cleaned = String(priceStr).replace(/[₹,\s]/g, "").replace(/[^0-9.]/g, "");
  const num = parseInt(cleaned, 10);
  if (isNaN(num)) throw new Error(`Failed to parse price: "${priceStr}"`);
  return num;
}

module.exports = { launchBrowser, newStealthPage, randomDelay, parsePrice };
