/**
 * SmartCompare Pro — Image Hasher
 *
 * Lightweight image fingerprinting using MD5 hash.
 * Used in Layer 3 matching for fashion/beauty products
 * where visual similarity is more reliable than text matching.
 */

const crypto = require("crypto");

/**
 * Download an image and compute its MD5 hash as a fingerprint.
 * @param {string} imageUrl - URL of the image to hash
 * @returns {Promise<string|null>} MD5 hex digest, or null on failure
 */
async function computeImageHash(imageUrl) {
  if (!imageUrl) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/*",
      },
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0) return null;

    return crypto
      .createHash("md5")
      .update(Buffer.from(buffer))
      .digest("hex");
  } catch {
    // Network errors, timeouts, aborts — all return null gracefully
    return null;
  }
}

/**
 * Compare two image hashes for similarity.
 * With MD5, only exact matches count (no perceptual similarity).
 * @param {string|null} hashA
 * @param {string|null} hashB
 * @returns {number} 1.0 if exact match, 0.0 otherwise
 */
function hashSimilarity(hashA, hashB) {
  if (!hashA || !hashB) return 0;
  return hashA === hashB ? 1.0 : 0.0;
}

module.exports = { computeImageHash, hashSimilarity };
