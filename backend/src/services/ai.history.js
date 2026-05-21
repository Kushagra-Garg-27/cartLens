/**
 * SmartCompare Pro — AI Price History Generator
 * Generates highly realistic 90-day price history for demonstration purposes,
 * incorporating realistic sales, variations, and drops.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("../config");
const logger = require("../utils/logger");
const db = require("../db");

let _genAI = null;
function getGenAI() {
  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  }
  return _genAI;
}

/**
 * Generates 90 days of realistic price history and stores it in the DB.
 * 
 * @param {string} productId - The DB ID of the product
 * @param {string} listingId - The DB ID of the listing to attach history to
 * @param {string} platform - "amazon.in", "flipkart", etc.
 * @param {number} currentPrice - Current price to anchor the generation
 * @param {string} category - Product category
 */
async function generateAndStoreHistory(productId, listingId, platform, currentPrice, category) {
  if (!listingId || !currentPrice) return;

  const prompt = `You are a financial simulator for Indian e-commerce.
I need 90 days of realistic daily price history for a product in the "${category}" category.
Platform: ${platform}. Current price: ₹${currentPrice}.

Rules:
- The data must be an array of 90 integers representing the price each day over the last 90 days.
- Index 0 is 90 days ago, Index 89 is today (must equal ${currentPrice}).
- The price should fluctuate realistically. Introduce occasional sales (e.g., dropping 10-20% for 3-5 days).
- Electronics drop in price over time, clothing is more seasonal.
- Do not output decimals. Only integers.

Respond ONLY with a JSON array of 90 integers. No markdown, no preamble.`;

  try {
    const model = getGenAI().getGenerativeModel({ 
      model: "gemini-2.5-flash-lite",
      generationConfig: { responseMimeType: "application/json" }
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text()?.trim() || "[]";
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const prices = JSON.parse(cleaned);

    if (!Array.isArray(prices) || prices.length === 0) return;

    logger.info({ service: "ai_history", event: "history_generated", product_id: productId, data_points: prices.length });

    // Seed into the DB backwards from today using parameterized queries
    const now = new Date();
    const days = prices.length;

    // Build parameterized VALUES — each row needs 4 params: listing_id, price, source, scraped_at
    const params = [];
    const valueClauses = [];
    for (let i = 0; i < days; i++) {
      const price = Number(prices[i]);
      if (isNaN(price) || price <= 0) continue; // Skip invalid AI-generated values
      const daysAgo = days - 1 - i;
      const date = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
      const offset = params.length;
      valueClauses.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
      params.push(listingId, price, 'ai_simulated', date.toISOString());
    }

    if (valueClauses.length > 0) {
      const query = `
        INSERT INTO price_history (listing_id, price, source, scraped_at)
        VALUES ${valueClauses.join(', ')}
      `;
      await db.query(query, params);
      logger.info({ service: "ai_history", event: "history_saved", product_id: productId, rows: valueClauses.length });
    }

  } catch (err) {
    logger.error({ service: "ai_history", event: "history_generation_error", error: err.message, product_id: productId });
    
    // Mathematical fallback to ensure the UI ALWAYS displays a stunning 90-day price trend chart
    try {
      logger.info({ service: "ai_history", event: "generating_mathematical_fallback", product_id: productId, platform });
      const prices = [];
      
      // Let's generate daily prices going backwards from today (day 89) to day 0.
      prices[89] = currentPrice;
      
      // Category & Platform specific characteristics
      const isFashion = category === "fashion" || platform === "myntra" || platform === "ajio";
      const drift = isFashion ? 0 : -0.0005; // electronics drift downward slightly over 90 days
      const volatility = isFashion ? 0.03 : 0.015; // fashion is more volatile / dynamic
      
      // Generate backwards: prices[i] based on prices[i+1]
      for (let i = 88; i >= 0; i--) {
        const change = (Math.random() - 0.5 + drift) * volatility;
        let nextPrice = Math.round(prices[i + 1] * (1 - change));
        
        // Ensure price doesn't go below 30% of anchor or above 150%
        if (nextPrice < currentPrice * 0.4) nextPrice = Math.round(currentPrice * 0.4);
        if (nextPrice > currentPrice * 1.5) nextPrice = Math.round(currentPrice * 1.5);
        
        prices[i] = nextPrice;
      }
      
      // Superimpose 2-3 realistic discount/sale events (lasting 3-7 days)
      const saleCount = 2 + Math.floor(Math.random() * 2);
      for (let s = 0; s < saleCount; s++) {
        const saleLen = 3 + Math.floor(Math.random() * 4);
        const startDay = Math.floor(Math.random() * (75 - saleLen));
        const discountPercent = 0.08 + Math.random() * 0.12;
        
        for (let i = startDay; i < startDay + saleLen; i++) {
          prices[i] = Math.round(prices[i] * (1 - discountPercent));
        }
      }
      
      // Enforce today's price matches currentPrice exactly
      prices[89] = currentPrice;

      logger.info({ service: "ai_history", event: "fallback_history_generated", product_id: productId, data_points: prices.length });

      const now = new Date();
      const params = [];
      const valueClauses = [];
      for (let i = 0; i < prices.length; i++) {
        const price = Number(prices[i]);
        if (isNaN(price) || price <= 0) continue;
        const daysAgo = prices.length - 1 - i;
        const date = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
        const offset = params.length;
        valueClauses.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
        params.push(listingId, price, 'mathematical_fallback', date.toISOString());
      }

      if (valueClauses.length > 0) {
        const query = `
          INSERT INTO price_history (listing_id, price, source, scraped_at)
          VALUES ${valueClauses.join(', ')}
        `;
        await db.query(query, params);
        logger.info({ service: "ai_history", event: "fallback_history_saved", product_id: productId, rows: valueClauses.length });
      }
    } catch (fallbackErr) {
      logger.error({ service: "ai_history", event: "fallback_generation_error", error: fallbackErr.message });
    }
  }
}

module.exports = { generateAndStoreHistory };
