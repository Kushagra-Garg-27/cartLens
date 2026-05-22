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

let _genAI = null;
function getGenAI() {
  if (!_genAI) {
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const config = require("../config");
    if (config.gemini.apiKey) {
      _genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    }
  }
  return _genAI;
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
        productId,
        productName: entry.canonical_name,
        platform,
        oldPrice,
        newPrice: price,
        targetPrice: entry.target_price,
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
 * Generate a highly premium, AI-powered price alert email and send it via Resend.
 */
async function sendAISmartAlert({
  userEmail,
  productId,
  productName,
  platform,
  oldPrice,
  newPrice,
  targetPrice,
  buyUrl,
  crossPlatformCheaper,
}) {
  const client = getResendClient();
  if (!client) {
    logger.warn({
      service: "alert",
      event: "resend_not_configured",
      message: "Skipping email — RESEND_API_KEY not set",
    });
    return;
  }

  const config = require("../config");
  const savings = oldPrice && oldPrice > newPrice
    ? ((oldPrice - newPrice) / oldPrice * 100).toFixed(1)
    : "0.0";

  // Fetch comparisons for the AI prompt
  let listingsText = "";
  let formattedListings = [];
  if (productId) {
    try {
      const compRes = await db.query(
        "SELECT platform, current_price, url FROM listings WHERE product_id = $1 AND current_price IS NOT NULL ORDER BY current_price ASC",
        [productId]
      );
      formattedListings = compRes.rows.map(r => ({
        platform: r.platform,
        price: parseFloat(r.current_price),
        url: r.url
      }));
      listingsText = compRes.rows.map(
        r => `- ${r.platform}: ₹${r.current_price}`
      ).join("\n");
    } catch (e) {
      logger.error({ service: "alert", event: "fetch_comparisons_error", error: e.message });
    }
  }

  let emailSubject = `⚡ Price Alert: ${productName} met your target!`;
  let emailHtml = "";

  // Call Gemini for the premium AI Response
  const genAI = getGenAI();
  if (genAI && config.gemini.apiKey) {
    try {
      const prompt = `
You are an advanced, premium AI deal intelligence analyst for "CartLens" (a smart comparison shopping assistant).

A price drop alert has been triggered for: "${productName}"
The user set a target price of: ₹${targetPrice || newPrice}
The current lowest price found is: ₹${newPrice} on ${platform}.
Historically, the price before this drop was: ₹${oldPrice || newPrice}.

Here are the current displaying prices across multiple platforms:
${listingsText || "- " + platform + ": ₹" + newPrice}

Generate a stunning, responsive, and professional HTML email to alert the user.

The email must:
1. Have an extremely premium, modern web design aesthetic with a deep indigo, electric purple, and dark navy gradient banner, rounded card containers, clean borders, high visual contrast, and professional typography (e.g. Inter, system-ui).
2. Include a premium badge at the top: "⚡ CartLens AI Smart Alert" or "Verified Deal".
3. Include a prominent section announcing the price alert has been successfully met, showing:
   - Target Price: ₹${targetPrice || "Not Set"}
   - New Lowest Price: ₹${newPrice}
   - Percentage Saved: ${savings}% off from previous price!
4. Include an elegant comparison table showing the prices across all compared platforms with a "Cheapest" badge highlighted in green next to the cheapest store.
5. Include an "AI Deal Analysis & Insights" section (light-purple styled box with a left indigo border) containing:
   - A smart, friendly analysis of why this is a fantastic time to buy.
   - AI Recommendation: Explicitly state either "BUY NOW" (if price is near low/average or a major discount) or "HOLD/WAIT" (if historical trends suggest a bigger upcoming sale event or further drop). Keep it professional, data-backed, and engaging.
6. A clear, premium Call-To-Action (CTA) button to "Buy on ${platform} for ₹${newPrice}" that links to ${buyUrl}.

Return the response STRICTLY as a JSON object with two fields:
- "subject": A catchy, professional email subject line (e.g. "⚡ AI Smart Alert: [Product] is now ₹[Price] on [Platform]! [Savings]% Off")
- "html": The complete premium HTML email string with full inlined CSS styling.

No markdown wrapping around the JSON, no backticks, no preamble, just the raw JSON object itself.
`;

      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite",
        generationConfig: { responseMimeType: "application/json" }
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text()?.trim() || "{}";
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(cleaned);

      if (parsed.subject && parsed.html) {
        emailSubject = parsed.subject;
        emailHtml = parsed.html;
        logger.info({ service: "alert", event: "gemini_email_generated", product: productName });
      }
    } catch (err) {
      logger.error({ service: "alert", event: "gemini_email_generation_error", error: err.message });
    }
  }

  // Fallback to high-quality responsive email if Gemini fails or is not configured
  if (!emailHtml) {
    emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Price Alert Met!</title>
      </head>
      <body style="margin:0; padding:0; background-color:#f1f5f9; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color:#1e293b;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px; margin:20px auto; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px; text-align: center;">
              <span style="background: rgba(255,255,255,0.2); color: #ffffff; padding: 6px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;">⚡ CartLens Smart Alert</span>
              <h1 style="color:#ffffff; margin: 12px 0 0 0; font-size: 24px; font-weight: 700;">Price Target Reached!</h1>
            </td>
          </tr>
          
          <!-- Content Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">Great news! The price for <strong>${productName}</strong> has reached your target price of <strong>₹${targetPrice || newPrice}</strong>!</p>
              
              <!-- Metrics Table -->
              <table width="100%" style="background-color: #f8fafc; border-radius: 8px; border-collapse: collapse; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b;">Current Lowest Price</td>
                  <td style="padding: 16px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #10b981; font-size: 18px;">₹${newPrice}</td>
                </tr>
                <tr>
                  <td style="padding: 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b;">Store</td>
                  <td style="padding: 16px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600; text-transform: capitalize;">${platform}</td>
                </tr>
                ${oldPrice && oldPrice > newPrice ? `
                <tr>
                  <td style="padding: 16px; font-weight: 600; color: #64748b;">Previous Price</td>
                  <td style="padding: 16px; text-align: right; text-decoration: line-through; color: #94a3b8;">₹${oldPrice}</td>
                </tr>
                ` : ""}
              </table>

              <!-- Cross platform table -->
              ${formattedListings.length > 0 ? `
              <h3 style="font-size: 16px; margin: 0 0 12px 0; color: #334155;">Displaying Prices Across Comparisons:</h3>
              <table width="100%" style="border-collapse: collapse; margin-bottom: 24px;">
                <thead>
                  <tr style="border-bottom: 2px solid #e2e8f0; text-align: left;">
                    <th style="padding: 8px; font-size: 14px; color: #64748b;">Store</th>
                    <th style="padding: 8px; font-size: 14px; color: #64748b; text-align: right;">Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${formattedListings.map((l, idx) => `
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 10px 8px; font-size: 14px; font-weight: 500; text-transform: capitalize;">
                      ${l.platform} ${idx === 0 ? `<span style="background-color: #d1fae5; color: #065f46; font-size: 10px; padding: 2px 6px; border-radius: 9999px; margin-left: 6px;">Cheapest</span>` : ""}
                    </td>
                    <td style="padding: 10px 8px; font-size: 14px; font-weight: 600; text-align: right; color: ${idx === 0 ? "#10b981" : "#334155"};">₹${l.price}</td>
                  </tr>
                  `).join("")}
                </tbody>
              </table>
              ` : ""}

              <!-- Smart Insights -->
              <div style="border-left: 4px solid #4f46e5; background-color: #f5f3ff; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
                <h4 style="margin: 0 0 6px 0; font-size: 14px; color: #4f46e5; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">💡 Smart Insights</h4>
                <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #4f46e5;">The price has dropped below your threshold of ₹${targetPrice || newPrice}. This represents a solid deal. Our advice is to <strong>BUY NOW</strong> as stock levels might deplete quickly.</p>
              </div>

              <!-- Button -->
              <div style="text-align: center; margin-top: 32px;">
                <a href="${buyUrl}" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 700; font-size: 16px; box-shadow: 0 4px 10px rgba(99, 102, 241, 0.4);">Buy Now on ${platform.toUpperCase()}</a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 8px 0;">You are receiving this email because you subscribed to price alerts on CartLens.</p>
              <p style="margin: 0;">&copy; ${new Date().getFullYear()} CartLens. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  // Send the email via Resend
  try {
    const response = await client.emails.send({
      from: config.email.fromEmail || "alerts@resend.dev",
      to: userEmail,
      subject: emailSubject,
      html: emailHtml,
    });
    logger.info({
      service: "alert",
      to: userEmail,
      subject: emailSubject,
      resend_id: response?.id || response?.data?.id || "unknown",
    });
  } catch (err) {
    logger.error({
      service: "alert",
      event: "ai_smart_alert_send_error",
      error: err.message,
    });
  }
}

/**
 * Send a price alert email via Resend (backward-compatible legacy wrapper).
 */
async function sendPriceAlert(params) {
  return sendAISmartAlert(params);
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

module.exports = { checkWatchlistAlerts, sendPriceAlert, sendSalePreAlerts, sendAISmartAlert };
