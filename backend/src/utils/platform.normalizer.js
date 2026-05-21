/**
 * SmartCompare Pro — Platform Name Normalizer
 *
 * Normalizes platform names sent by the extension to match the registry keys in `platforms.js`.
 */

const PLATFORM_MAP = {
  "flipkart.com": "flipkart",
  "flipkart": "flipkart",
  "amazon.in": "amazon.in",
  "amazon": "amazon.in",
  "croma.com": "croma",
  "croma": "croma",
  "reliancedigital.in": "reliancedigital",
  "reliancedigital": "reliancedigital",
  "vijaysales.com": "vijaysales",
  "vijaysales": "vijaysales",
  "myntra.com": "myntra",
  "myntra": "myntra",
  "ajio.com": "ajio",
  "ajio": "ajio",
  "nykaa.com": "nykaa",
  "nykaafashion.com": "nykaa",
  "nykaafashion": "nykaa",
  "nykaa": "nykaa",
  "tatacliq.com": "tatacliq",
  "tatacliq": "tatacliq",
  "firstcry.com": "firstcry",
  "firstcry": "firstcry",
  "blinkit.com": "blinkit",
  "blinkit": "blinkit",

  "bigbasket.com": "bigbasket",
  "bigbasket": "bigbasket",
  "apple.com": "appleindia",
  "appleindia": "appleindia",
  "decathlon.in": "decathlon",
  "decathlon": "decathlon",
  "kitabay.com": "kitabay",
  "kitabay": "kitabay"
};

/**
 * Standardize platform string to backend registry keys.
 * @param {string} rawPlatform
 * @returns {string} Normalized platform key, or original if not recognized
 */
function normalizePlatform(rawPlatform) {
  if (!rawPlatform) return "";
  const cleaned = rawPlatform.toLowerCase().trim();
  return PLATFORM_MAP[cleaned] || cleaned;
}

module.exports = { normalizePlatform, PLATFORM_MAP };
