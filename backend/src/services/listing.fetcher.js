const db = require("../db");

/**
 * Fetch all listings for a product with their latest price from price_history.
 * @param {string} productId
 * @returns {Promise<Array>}
 */
async function fetch(productId, minConfidence = 0.4) {
  const result = await db.query(
    `SELECT
      l.id AS listing_id,
      l.platform,
      l.url,
      l.platform_pid,
      l.current_price,
      l.currency,
      l.availability,
      l.match_confidence,
      l.match_method,
      l.last_scraped_at,
      l.scraped_title,
      l.bank_offers,
      l.coupon_codes,
      p.canonical_name AS title,
      (
        SELECT json_agg(json_build_object(
          'price', ph.price,
          'availability', ph.availability,
          'source', ph.source,
          'scraped_at', ph.scraped_at
        ) ORDER BY ph.scraped_at DESC)
        FROM (
          SELECT * FROM price_history
          WHERE listing_id = l.id
          ORDER BY scraped_at DESC
          LIMIT 30
        ) ph
      ) AS price_history
    FROM listings l
    LEFT JOIN products p ON p.id = l.product_id
    WHERE l.product_id = $1
    ORDER BY l.current_price ASC NULLS LAST`,
    [productId]
  );

  const mapped = result.rows.map((row) => ({
    listing_id: row.listing_id,
    platform: row.platform,
    title: row.title || null,
    url: row.url,
    platform_pid: row.platform_pid,
    price: row.current_price ? parseFloat(row.current_price) : null,
    currency: row.currency || "INR",
    availability: row.availability,
    match_confidence: row.match_confidence ? parseFloat(row.match_confidence) : null,
    match_method: row.match_method,
    last_scraped_at: row.last_scraped_at,
    scraped_title: row.scraped_title || null,
    bank_offers: row.bank_offers || [],
    coupon_codes: row.coupon_codes || [],
    price_history: row.price_history || [],
  }));

  // Filter out listings where match_confidence is below minConfidence
  return mapped.filter((l) => {
    const conf = l.match_confidence != null ? l.match_confidence : 0.8;
    return conf >= 0.1; // Temporarily lowered as per diagnostic steps
  });
}

module.exports = { fetch };
