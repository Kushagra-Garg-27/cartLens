/**
 * SmartCompare Pro — URL Normalizer
 *
 * Strips tracking parameters, query strings, and standardizes product URLs
 * to prevent duplicate listing entries in the database.
 */

const { normalizePlatform } = require("./platform.normalizer");

/**
 * Normalize a product URL based on the platform.
 * @param {string} rawUrl
 * @param {string} rawPlatform
 * @returns {string} Canonical URL
 */
function normalizeProductUrl(rawUrl, rawPlatform) {
  if (!rawUrl) return "";
  
  try {
    const platform = normalizePlatform(rawPlatform);
    
    // 1. Amazon India normalization
    if (platform === "amazon.in") {
      const asinMatch = rawUrl.match(/\/dp\/([A-Z0-9]{10})/i) || rawUrl.match(/\/gp\/product\/([A-Z0-9]{10})/i);
      if (asinMatch) {
        return `https://www.amazon.in/dp/${asinMatch[1].toUpperCase()}`;
      }
    }
    
    // 2. Flipkart normalization
    if (platform === "flipkart") {
      const parsed = new URL(rawUrl);
      const pid = parsed.searchParams.get("pid");
      parsed.search = ""; // Strip all other query/tracking params
      if (pid) {
        parsed.searchParams.set("pid", pid);
      }
      return parsed.toString();
    }
    
    // 3. General normalization for other platforms (Croma, Myntra, Ajio, Reliance, etc.)
    // For general e-commerce pages, query parameters are purely tracking/affiliate.
    // Paths are sufficient to identify products.
    const parsed = new URL(rawUrl);
    parsed.search = ""; // Strip query string
    parsed.hash = "";   // Strip hash anchors
    return parsed.toString();
  } catch (err) {
    // Fallback if URL parsing fails
    return rawUrl;
  }
}

module.exports = { normalizeProductUrl };
