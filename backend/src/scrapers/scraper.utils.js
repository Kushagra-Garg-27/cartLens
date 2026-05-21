const { tokenize } = require("../utils/text.utils");

/**
 * Select the best-matching result from a list of candidates against the search query.
 * Candidates are [{url, title}].
 * @param {Array<{url: string, title: string}>} candidates
 * @param {string} query
 * @returns {string} The URL of the best-matching candidate, or the first candidate's URL if none score above 0.2.
 */
function pickBestResult(candidates, query) {
  if (!candidates || candidates.length === 0) return null;
  if (!query) return candidates[0].url;

  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return candidates[0].url;

  let bestUrl = candidates[0].url;
  let bestScore = -1;

  for (const candidate of candidates) {
    if (!candidate.title) continue;
    const titleTokens = new Set(tokenize(candidate.title));
    if (titleTokens.size === 0) continue;

    const intersection = [...queryTokens].filter(t => titleTokens.has(t));
    const union = new Set([...queryTokens, ...titleTokens]);
    const score = intersection.length / union.size;

    if (score > bestScore) {
      bestScore = score;
      bestUrl = candidate.url;
    }
  }

  // Fall back to the first if none score above 0.2
  if (bestScore <= 0.2) {
    return candidates[0].url;
  }

  return bestUrl;
}

module.exports = { pickBestResult };
