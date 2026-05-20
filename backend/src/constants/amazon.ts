/**
 * Amazon India configuration and URL helpers.
 *
 * SmartCompare Pro currently treats Amazon as India-only.
 */

export const AMAZON_BASE_URL = "https://www.amazon.in" as const;
export const AMAZON_DOMAIN = "amazon.in" as const;
export const AMAZON_CURRENCY = "INR" as const;
export const AMAZON_REGION = "IN" as const;

const ASIN_REGEX = /(?:\/dp\/|\/gp\/product\/|\/exec\/obidos\/ASIN\/)([A-Z0-9]{10})(?:[/?]|$)/i;

export function extractAmazonAsin(input: string): string | null {
  const match = input.match(ASIN_REGEX);
  return match?.[1]?.toUpperCase() ?? null;
}

export function buildAmazonIndiaProductUrl(asin: string): string {
  return `${AMAZON_BASE_URL}/dp/${asin.toUpperCase()}`;
}

/**
 * Canonicalize any Amazon product URL into an Amazon India `/dp/{ASIN}` URL.
 *
 * - If an ASIN is present anywhere in the string, we return the India PDP URL.
 * - If the URL is already on amazon.in (or a subdomain) but has no ASIN, we
 *   normalize scheme/host and strip common tracking params.
 * - Otherwise returns null (we refuse to guess cross-region paths).
 */
export function canonicalizeAmazonIndiaUrl(url: string): string | null {
  const asin = extractAmazonAsin(url);
  if (asin) return buildAmazonIndiaProductUrl(asin);

  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host !== AMAZON_DOMAIN && !host.endsWith(`.${AMAZON_DOMAIN}`)) {
      return null;
    }

    u.protocol = "https:";
    u.hostname = new URL(AMAZON_BASE_URL).hostname; // www.amazon.in

    // Strip common tracking params (keeps functional params like `k` on search pages)
    const trackingParams = [
      "tag",
      "linkCode",
      "camp",
      "creative",
      "creativeASIN",
      "ref",
      "ref_",
      "ascsubtag",
      "th",
      "psc",
      "smid",
      "pf_rd_p",
      "pf_rd_r",
      "pd_rd_w",
      "pd_rd_wg",
      "pd_rd_r",
      "qid",
      "sr",
      "sprefix",
    ];
    for (const p of trackingParams) u.searchParams.delete(p);

    return u.toString();
  } catch {
    return null;
  }
}

export function buildAmazonIndiaSearchUrl(query: string): string {
  return `${AMAZON_BASE_URL}/s?k=${encodeURIComponent(query)}`;
}
