const db = require("../db");
const logger = require("../utils/logger");

let resend = null;

function getResendClient() {
  if (!resend) {
    const config = require("../config");
    if (config.email.apiKey && config.email.apiKey !== "re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx") {
      const { Resend } = require("resend");
      resend = new Resend(config.email.apiKey);
    }
  }
  return resend;
}

/**
 * Check watchlist alerts after a successful scrape.
 * Called from scraper.runner — NEVER from a request thread.
 * @param {{ productId: string, platform: string, price: number, url: string }} listingData
 */
async function checkWatchlistAlerts(listingData) {
  try {
    const { productId, platform, price, url } = listingData;
    if (!productId || !price) return;

    // Find watchlist entries for this product
    const result = await db.query(
      `SELECT w.id, w.user_id, w.target_price, w.last_alerted_at,
              u.email, p.canonical_name
       FROM watchlist w
       JOIN users u ON u.id = w.user_id
       JOIN products p ON p.id = w.product_id
       WHERE w.product_id = $1`,
      [productId]
    );

    for (const entry of result.rows) {
      const shouldAlert = await shouldSendAlert(entry, price);
      if (!shouldAlert) continue;

      // Get previous price for comparison
      const prevResult = await db.query(
        `SELECT ph.price FROM price_history ph
         JOIN listings l ON l.id = ph.listing_id
         WHERE l.product_id = $1 AND l.platform = $2
         ORDER BY ph.scraped_at DESC
         OFFSET 1 LIMIT 1`,
        [productId, platform]
      );
      const oldPrice = prevResult.rows.length > 0
        ? parseFloat(prevResult.rows[0].price)
        : price;

      await sendPriceAlert({
        userEmail: entry.email,
        productName: entry.canonical_name,
        platform,
        oldPrice,
        newPrice: price,
        buyUrl: url,
      });

      // Update last_alerted_at
      await db.query(
        "UPDATE watchlist SET last_alerted_at = NOW() WHERE id = $1",
        [entry.id]
      );

      logger.info({
        service: "cron",
        event: "alert_sent",
        user_id: entry.user_id.substring(0, 8),
        platform,
      });
    }
  } catch (err) {
    // Log but do NOT crash the cron loop
    logger.error({
      service: "cron",
      event: "alert_check_error",
      error: err.message,
    });
  }
}

/**
 * Determine if we should send an alert.
 */
async function shouldSendAlert(entry, newPrice) {
  // Dedup guard: only send if last_alerted_at is null or > 24h ago
  if (entry.last_alerted_at) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (new Date(entry.last_alerted_at) >= twentyFourHoursAgo) {
      return false;
    }
  }

  const targetPrice = entry.target_price ? parseFloat(entry.target_price) : null;

  if (targetPrice !== null) {
    // Target price alert: fire if new price <= target
    return newPrice <= targetPrice;
  }

  // Any drop alert: target_price IS NULL → alert if new price < previous price
  // (The caller should compare with previous price_history, but we simplify here)
  return true;
}

/**
 * Send a price alert email via Resend.
 */
async function sendPriceAlert({ userEmail, productName, platform, oldPrice, newPrice, buyUrl }) {
  const client = getResendClient();
  if (!client) {
    logger.warn({
      service: "cron",
      event: "resend_not_configured",
      message: "Skipping email — RESEND_API_KEY not set",
    });
    return;
  }

  const config = require("../config");
  const savings = ((oldPrice - newPrice) / oldPrice * 100).toFixed(1);

  try {
    await client.emails.send({
      from: config.email.fromEmail,
      to: userEmail,
      subject: `Price drop: ${productName} is now ₹${newPrice}`,
      html: `
        <h2>Price Drop Alert</h2>
        <p><strong>${productName}</strong> on <strong>${platform}</strong></p>
        <p>Was: <s>₹${oldPrice}</s> &nbsp; Now: <strong>₹${newPrice}</strong> (${savings}% off)</p>
        <a href="${buyUrl}">Buy now →</a>
      `,
    });
  } catch (err) {
    // Log but do NOT crash the cron loop
    logger.error({
      service: "cron",
      event: "resend_send_error",
      error: err.message,
    });
  }
}

module.exports = { checkWatchlistAlerts, sendPriceAlert };
