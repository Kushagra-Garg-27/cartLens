const { tokenize } = require("../utils/text.utils");

const HIGH_SIGNIFICANCE_WORDS = [
  "iphone", "ipad", "macbook", "imac", "watch", "airpods", "tv", "tablet", 
  "laptop", "phone", "buds", "headphone", "audio", "camera", "refrigerator", 
  "fridge", "dryer", "ac", "conditioner", "trimmer", "s24", "s23", "pixel"
];

function pickBestResult(candidates, query) {
  if (!candidates || candidates.length === 0) return null;
  if (!query) return candidates[0].url;

  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return candidates[0].url;

  const queryLower = query.toLowerCase();
  const queryHighSigWords = HIGH_SIGNIFICANCE_WORDS.filter(w => queryLower.includes(w));

  let bestUrl = candidates[0].url;
  let bestScore = -1;
  let hasValidHighSigMatch = false;

  for (const candidate of candidates) {
    if (!candidate.title) continue;

    // Reject cross-category mismatches (e.g., query contains 'iphone', candidate does not)
    if (queryHighSigWords.length > 0) {
      const titleLower = candidate.title.toLowerCase();
      const matchesAny = queryHighSigWords.some(w => titleLower.includes(w));
      if (!matchesAny) continue; // Skip this mismatch completely
    }

    const titleTokens = new Set(tokenize(candidate.title));
    if (titleTokens.size === 0) continue;

    const intersection = [...queryTokens].filter(t => titleTokens.has(t));
    const union = new Set([...queryTokens, ...titleTokens]);
    const score = intersection.length / union.size;

    if (score > bestScore) {
      bestScore = score;
      bestUrl = candidate.url;
      hasValidHighSigMatch = true;
    }
  }

  // Fall back to the first if none score above 0.2
  // But if we had high significance words and none matched, do NOT fall back to a mismatch
  if (bestScore <= 0.2) {
    if (queryHighSigWords.length > 0 && !hasValidHighSigMatch) {
      return null; // Return null so the scraper triggers search fallback
    }
    return candidates[0].url;
  }

  return bestUrl;
}

/**
 * Perform a DuckDuckGo HTML search for a specific site and query to find candidate links.
 * @param {import("playwright").Page} page
 * @param {string} site Domain name (e.g. amazon.in, croma.com)
 * @param {string} query Search query
 * @param {string} linkPattern Substring to filter candidate links
 * @returns {Promise<Array<{url: string, title: string}>>}
 */
async function searchProductOnDDG(page, site, query, linkPattern) {
  let ddgUrl = `https://html.duckduckgo.com/html/?q=site:${site}+${encodeURIComponent(query)}`;
  await page.goto(ddgUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);

  let candidates = await page.evaluate((pattern) => {
    const results = [];
    const links = document.querySelectorAll("a");
    for (const link of links) {
      let href = link.getAttribute("href") || "";
      const titleText = link.innerText.replace(/\s+/g, ' ').trim();
      
      let realUrl = href;
      if (href.startsWith("//")) realUrl = "https:" + href;
      if (realUrl.includes("duckduckgo.com/l/?uddg=")) {
        const match = realUrl.match(/[?&]uddg=([^&]+)/);
        if (match) {
          realUrl = decodeURIComponent(match[1]);
        }
      }
      
      if (realUrl.includes(pattern)) {
        if (titleText && !results.some(r => r.url === realUrl)) {
          results.push({ url: realUrl, title: titleText });
        }
      }
    }
    return results;
  }, linkPattern);

  // Fallback: If site search returned no results, perform a standard keyword search on DDG
  if (!candidates || candidates.length === 0) {
    const fallbackQuery = `${site} ${query}`;
    ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(fallbackQuery)}`;
    await page.goto(ddgUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    candidates = await page.evaluate((pattern) => {
      const results = [];
      const links = document.querySelectorAll("a");
      for (const link of links) {
        let href = link.getAttribute("href") || "";
        const titleText = link.innerText.replace(/\s+/g, ' ').trim();
        
        let realUrl = href;
        if (href.startsWith("//")) realUrl = "https:" + href;
        if (realUrl.includes("duckduckgo.com/l/?uddg=")) {
          const match = realUrl.match(/[?&]uddg=([^&]+)/);
          if (match) {
            realUrl = decodeURIComponent(match[1]);
          }
        }
        
        if (realUrl.includes(pattern)) {
          if (titleText && !results.some(r => r.url === realUrl)) {
            results.push({ url: realUrl, title: titleText });
          }
        }
      }
      return results;
    }, linkPattern);
  }

  return candidates;
}

module.exports = { pickBestResult, searchProductOnDDG };
