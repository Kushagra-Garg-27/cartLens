/**
 * Price formatting helpers for Indian Rupee format.
 */

/**
 * Format a number as Indian Rupee string (₹1,23,456).
 * @param {number} price
 * @returns {string}
 */
function formatINR(price) {
  if (price == null || isNaN(price)) return "₹0";
  const num = Number(price);
  return "₹" + num.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Parse an Indian-formatted price string to a number.
 * Strips ₹ symbol, commas, spaces. Handles "1,23,456" format.
 * @param {string} priceStr
 * @returns {number|null}
 */
function parseIndianPrice(priceStr) {
  if (!priceStr) return null;
  const cleaned = String(priceStr)
    .replace(/[₹,\s]/g, "")
    .replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Calculate savings percentage.
 * @param {number} referencePrice - Higher price
 * @param {number} bestPrice - Lower price
 * @returns {{ amount: number, percent: number }}
 */
function calculateSavings(referencePrice, bestPrice) {
  if (!referencePrice || !bestPrice || referencePrice <= 0) {
    return { amount: 0, percent: 0 };
  }
  const amount = referencePrice - bestPrice;
  const percent = (amount / referencePrice) * 100;
  return {
    amount: Math.round(amount * 100) / 100,
    percent: Math.round(percent * 10) / 10,
  };
}

module.exports = { formatINR, parseIndianPrice, calculateSavings };
