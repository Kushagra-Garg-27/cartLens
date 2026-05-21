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

// Lightweight browser pool
let activeBrowserCount = 0;
const pool = [];
const MAX_POOL_SIZE = 2;

// Clean up inactive browsers (closed after 5 mins of inactivity)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (let i = pool.length - 1; i >= 0; i--) {
      const item = pool[i];
      if (now - item.lastUsed > 5 * 60 * 1000) {
        pool.splice(i, 1);
        item.browser.close().catch(() => {});
        activeBrowserCount = Math.max(0, activeBrowserCount - 1);
        logger.info({
          service: "scraper",
          event: "browser_pool_inactive_close",
          msg: "Closed pooled browser due to 5 min inactivity"
        });
      }
    }
  }, 60000).unref();
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
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });
}

async function acquireBrowser() {
  if (!chromium) {
    throw new Error("Playwright is not installed. Run: npx playwright install chromium");
  }

  // Find a valid, connected browser from the pool
  while (pool.length > 0) {
    const item = pool.shift();
    if (item.browser.isConnected()) {
      item.lastUsed = Date.now();
      logger.info({
        service: "scraper",
        event: "browser_pool_acquire_existing",
        pages_served: item.browser._pagesServed || 0
      });
      return item.browser;
    } else {
      activeBrowserCount = Math.max(0, activeBrowserCount - 1);
    }
  }

  // If pool is empty, check if we can launch a new one
  if (activeBrowserCount < MAX_POOL_SIZE) {
    logger.info({
      service: "scraper",
      event: "browser_pool_launch_new",
      active_browsers: activeBrowserCount + 1
    });
    const browser = await launchBrowser();
    browser._pagesServed = 0;
    activeBrowserCount++;
    return browser;
  }

  // Poll for an available browser up to 60 seconds
  logger.info({
    service: "scraper",
    event: "browser_pool_waiting",
    active_browsers: activeBrowserCount
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    while (pool.length > 0) {
      const item = pool.shift();
      if (item.browser.isConnected()) {
        item.lastUsed = Date.now();
        logger.info({
          service: "scraper",
          event: "browser_pool_acquire_waiting",
          pages_served: item.browser._pagesServed || 0
        });
        return item.browser;
      } else {
        activeBrowserCount = Math.max(0, activeBrowserCount - 1);
      }
    }
    if (activeBrowserCount < MAX_POOL_SIZE) {
      const browser = await launchBrowser();
      browser._pagesServed = 0;
      activeBrowserCount++;
      return browser;
    }
  }

  throw new Error("Timeout waiting for a browser to become available in the pool");
}

async function releaseBrowser(browser) {
  if (!browser) return;

  if (!browser.isConnected()) {
    activeBrowserCount = Math.max(0, activeBrowserCount - 1);
    return;
  }

  browser._pagesServed = (browser._pagesServed || 0) + 1;

  if (browser._pagesServed >= 20) {
    logger.info({
      service: "scraper",
      event: "browser_pool_recycle",
      msg: "Closing browser after serving 20 pages to prevent memory leaks"
    });
    await browser.close().catch(() => {});
    activeBrowserCount = Math.max(0, activeBrowserCount - 1);
  } else {
    logger.info({
      service: "scraper",
      event: "browser_pool_release",
      pages_served: browser._pagesServed
    });
    pool.push({
      browser,
      pagesServed: browser._pagesServed,
      lastUsed: Date.now(),
    });
  }
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
  let cleaned = String(priceStr).trim();
  const parts = cleaned.split(/(?:MRP|mrp|Off|off|Save|save|Discount|discount|%)/i);
  if (parts.length > 0) {
    cleaned = parts[0];
  }
  if (/\.\d{2}$/.test(cleaned)) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  } else if (/\.\d{1}$/.test(cleaned)) {
    cleaned = cleaned.substring(0, cleaned.length - 2);
  }
  const match = cleaned.replace(/[^0-9]/g, "");
  const num = parseInt(match, 10);
  if (isNaN(num)) throw new Error(`Failed to parse price: "${priceStr}"`);
  return num;
}

module.exports = { launchBrowser, acquireBrowser, releaseBrowser, newStealthPage, randomDelay, parsePrice };
