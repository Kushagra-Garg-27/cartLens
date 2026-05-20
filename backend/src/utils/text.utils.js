/**
 * SmartCompare Pro — Text Utilities
 *
 * Token-based text matching for product comparison.
 * Includes basic Jaccard (legacy), weighted Jaccard (Layer 2 NLP),
 * and Levenshtein distance for fuzzy fallback.
 */

const STOP_WORDS = new Set([
  "the", "best", "new", "with", "for", "and", "by", "in", "at", "of", "a", "an",
  "sale", "buy", "offer", "deal", "india", "official", "original", "genuine",
  "online", "price", "shop", "store", "latest", "exclusive", "limited", "premium",
  "free", "shipping", "delivery", "available", "stock", "combo", "pack",
]);

/**
 * Weight rules for technical product attributes.
 * Higher weight = more important for matching.
 */
const WEIGHT_RULES = [
  { pattern: /^[A-Z]{2,}[0-9]+[A-Z0-9]*$/i, weight: 3.0, label: "model" },     // e.g. MC6A4HN, SM-S928B
  { pattern: /^\d{3,}gb$/i,                   weight: 2.5, label: "storage" },   // 512gb, 256gb
  { pattern: /^\d{1,2}gb$/i,                  weight: 2.5, label: "ram" },       // 16gb, 8gb
  { pattern: /^\d{2,4}mah$/i,                 weight: 2.0, label: "battery" },   // 5000mah
  { pattern: /^\d{2,3}inch$/i,                weight: 2.0, label: "size" },      // 13inch, 55inch
  { pattern: /^\d{2,3}"$/i,                   weight: 2.0, label: "size_alt" },  // 13", 55"
  { pattern: /^m[1-9]|^i[3579]|^ryzen/i,      weight: 2.5, label: "chip" },     // m4, i7, ryzen
  { pattern: /^\d+mp$/i,                       weight: 1.5, label: "camera" },   // 50mp, 108mp
  { pattern: /^\d+w$/i,                        weight: 1.5, label: "wattage" },  // 750w, 45w
  { pattern: /^\d+l$/i,                        weight: 1.5, label: "capacity" }, // 4l, 236l
  { pattern: /^\d+kg$/i,                       weight: 1.5, label: "weight" },   // 7kg, 5kg
  { pattern: /^\d+mm$/i,                       weight: 1.5, label: "dimension" },// 400mm
];

/**
 * Lowercase, strip non-alphanumeric, trim.
 * @param {string} str
 * @returns {string}
 */
function normalizeText(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

/**
 * Split into tokens, remove stop words and single chars.
 * @param {string} title
 * @returns {string[]}
 */
function tokenize(title) {
  if (!title) return [];
  return normalizeText(title)
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/**
 * Jaccard similarity score between two product titles.
 * Returns 0 immediately if brands don't match.
 * @param {string} titleA
 * @param {string} titleB
 * @param {string} [brandA]
 * @param {string} [brandB]
 * @returns {number} 0.0–1.0
 */
function matchScore(titleA, titleB, brandA, brandB) {
  if (brandA && brandB && normalizeText(brandA) !== normalizeText(brandB)) {
    return 0;
  }
  const setA = new Set(tokenize(titleA));
  const setB = new Set(tokenize(titleB));
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = [...setA].filter((t) => setB.has(t));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return intersection.length / union.size;
}

/**
 * Tokenize with weights — technical attributes get higher multipliers.
 * @param {string} title
 * @returns {{ token: string, weight: number }[]}
 */
function tokenizeWeighted(title) {
  if (!title) return [];
  const normalized = title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  return normalized
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
    .map((t) => {
      const rule = WEIGHT_RULES.find((r) => r.pattern.test(t));
      return { token: t, weight: rule ? rule.weight : 1.0 };
    });
}

/**
 * Weighted Jaccard similarity score.
 * Returns 0 immediately if brands don't match.
 * Technical tokens (model numbers, specs) contribute more to the score.
 *
 * @param {string} titleA
 * @param {string} brandA
 * @param {string} titleB
 * @param {string} brandB
 * @returns {number} 0.0–1.0
 */
function matchScoreWeighted(titleA, brandA, titleB, brandB) {
  // Brand mismatch = instant reject
  if (brandA && brandB) {
    const ba = brandA.toLowerCase().replace(/[^a-z]/g, "");
    const bb = brandB.toLowerCase().replace(/[^a-z]/g, "");
    if (ba && bb && ba !== bb) return 0;
  }

  const tokensA = tokenizeWeighted(titleA);
  const tokensB = tokenizeWeighted(titleB);

  if (tokensA.length === 0 && tokensB.length === 0) return 0;

  const mapA = new Map(tokensA.map((t) => [t.token, t.weight]));
  const mapB = new Map(tokensB.map((t) => [t.token, t.weight]));

  let intersectionWeight = 0;
  let unionWeight = 0;

  const allTokens = new Set([...mapA.keys(), ...mapB.keys()]);
  for (const token of allTokens) {
    const wa = mapA.get(token) || 0;
    const wb = mapB.get(token) || 0;
    intersectionWeight += Math.min(wa, wb);
    unionWeight += Math.max(wa, wb);
  }

  return unionWeight === 0 ? 0 : intersectionWeight / unionWeight;
}

/**
 * Levenshtein edit distance between two strings.
 * Used as a fuzzy fallback when token-based matching is inconclusive.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} Edit distance (0 = identical)
 */
function levenshtein(a, b) {
  if (!a) return b ? b.length : 0;
  if (!b) return a.length;

  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

module.exports = {
  STOP_WORDS,
  normalizeText,
  tokenize,
  matchScore,
  tokenizeWeighted,
  matchScoreWeighted,
  levenshtein,
};
