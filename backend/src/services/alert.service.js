const db = require("../db");
const logger = require("../utils/logger");
const dealDetector = require("./deal.detector");

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

    // Compute buy recommendation for predictive warning
    const buyRec = await dealDetector.computeBuyRecommendation(productId, price);
    let predictiveAdvice = "";
    if (buyRec && buyRec.score) {
      if (buyRec.score < 40) {
        predictiveAdvice = "Price has reached your target, but our historical analysis suggests it may drop further soon. You might want to wait.";
      } else if (buyRec.score >= 75) {
        predictiveAdvice = "This is an excellent time to buy — the price is near its historical lows!";
      }
    }

    // Check if there's any listing on ANOTHER platform that is even cheaper
    const cheaperResults = await db.query(
      `SELECT platform, current_price, url FROM listings
       WHERE product_id = $1 AND platform != $2 AND current_price < $3 AND availability = 'in_stock'
       ORDER BY current_price ASC LIMIT 1`,
      [productId, platform, price]
    );

    let crossPlatformCheaper = null;
    if (cheaperResults.rows.length > 0) {
      crossPlatformCheaper = {
        platform: cheaperResults.rows[0].platform,
        price: parseFloat(cheaperResults.rows[0].current_price),
        url: cheaperResults.rows[0].url
      };
    }

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
        predictiveAdvice,
        crossPlatformCheaper,
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
  return true;
}

/**
 * Send a price alert email via Resend.
 */
async function sendPriceAlert({ userEmail, productName, platform, oldPrice, newPrice, buyUrl, predictiveAdvice, crossPlatformCheaper }) {
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

  let htmlContent = `
    <h2>Price Drop Alert</h2>
    <p><strong>${productName}</strong> on <strong>${platform}</strong></p>
    <p>Was: <s>₹${oldPrice}</s> &nbsp; Now: <strong>₹${newPrice}</strong> (${savings}% off)</p>
  `;

  if (predictiveAdvice) {
    htmlContent += `<p style="color: #c2410c; font-weight: bold;">💡 Smart Insights: ${predictiveAdvice}</p>`;
  }

  if (crossPlatformCheaper) {
    htmlContent += `
      <p style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px; border-radius: 5px;">
        🌟 <strong>Cross-Platform Match:</strong> We also found this product cheaper on <strong>${crossPlatformCheaper.platform}</strong> for <strong>₹${crossPlatformCheaper.price}</strong>!
        <br/><a href="${crossPlatformCheaper.url}">Buy on ${crossPlatformCheaper.platform} instead →</a>
      </p>
    `;
  }

  htmlContent += `<br/><a href="${buyUrl}" style="background: #2563eb; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; display: inline-block;">Buy now →</a>`;

  try {
    await client.emails.send({
      from: config.email.fromEmail,
      to: userEmail,
      subject: `Price drop: ${productName} is now ₹${newPrice}`,
      html: htmlContent,
    });
  } catch (err) {
    logger.error({
      service: "cron",
      event: "resend_send_error",
      error: err.message,
    });
  }
}

/**
 * Scan watchlist and send heads-up alerts 3 days before upcoming sale events.
 */
async function sendSalePreAlerts() {
  const client = getResendClient();
  if (!client) return;

  try {
    // Check if there is a sale coming in exactly 3 days (offset = 3)
    const upcomingSale = dealDetector.detectActiveSaleEvent(3);
    if (!upcomingSale) return; // No sale starting in 3 days

    // Find all watchlisted products and the users watching them
    const watchlistResult = await db.query(
      `SELECT w.id, w.user_id, w.product_id, u.email, p.canonical_name
       FROM watchlist w
       JOIN users u ON u.id = w.user_id
       JOIN products p ON p.id = w.product_id`
    );

    for (const row of watchlistResult.rows) {
      const { user_id, product_id, email, canonical_name } = row;

      // Check if we already sent a prealert for this user + product + sale
      const logCheck = await db.query(
        "SELECT id FROM sale_prealert_log WHERE user_id = $1 AND product_id = $2 AND sale_event = $3",
        [user_id, product_id, upcomingSale]
      );
      if (logCheck.rows.length > 0) continue; // Already warned

      // Fetch last year price or stats for comparison
      const stats = await dealDetector.computePriceStats(product_id);
      const averagePrice = stats.avg_price_90d ? parseFloat(stats.avg_price_90d) : null;

      const config = require("../config");
      let htmlContent = `
        <h2>Upcoming Sale Event Alert ⚡</h2>
        <p>Hi there,</p>
        <p>Our intelligent deal tracker forecasts that the <strong>${upcomingSale}</strong> is starting in 3 days!</p>
        <p>You have <strong>${canonical_name}</strong> on your watchlist.</p>
      `;

      if (averagePrice) {
        htmlContent += `<p>Its recent 90-day average price is <strong>₹${averagePrice.toFixed(2)}</strong>. We recommend waiting for the sale to check for additional price cuts!</p>`;
      } else {
        htmlContent += `<p>We suggest holding off on your purchase until the sale starts to secure the best possible deal.</p>`;
      }

      htmlContent += `<p>Happy shopping,<br/>Team CartLens</p>`;

      try {
        await client.emails.send({
          from: config.email.fromEmail,
          to: email,
          subject: `Upcoming Sale: ${upcomingSale} starting in 3 days!`,
          html: htmlContent,
        });

        // Log prealert
        await db.query(
          "INSERT INTO sale_prealert_log (user_id, product_id, sale_event) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
          [user_id, product_id, upcomingSale]
        );

        logger.info({
          service: "cron",
          event: "sale_prealert_sent",
          user_id: user_id.substring(0, 8),
          product_id: product_id.substring(0, 8),
          sale: upcomingSale,
        });
      } catch (err) {
        logger.error({
          service: "cron",
          event: "sale_prealert_error",
          error: err.message,
        });
      }
    }
  } catch (err) {
    logger.error({
      service: "cron",
      event: "sale_prealerts_run_error",
      error: err.message,
    });
  }
}

module.exports = { checkWatchlistAlerts, sendPriceAlert, sendSalePreAlerts };
