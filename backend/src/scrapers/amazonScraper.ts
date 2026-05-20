/**
 * Amazon Scraper — Extracts product data from Amazon India (amazon.in) only.
 */

import * as cheerio from "cheerio";
import type { StoreScraper, ScraperResult, ScraperSearchResult } from "./base.js";
import {
  parsePrice,
  extractJsonLd,
  extractPriceFromJsonLd,
  safeFetch,
  createBaseResult,
} from "./base.js";
import {
  AMAZON_CURRENCY,
  buildAmazonIndiaProductUrl,
  buildAmazonIndiaSearchUrl,
  canonicalizeAmazonIndiaUrl,
} from "../constants/amazon.js";

export class AmazonScraper implements StoreScraper {
  readonly storeId = "amazon";

  async scrapeProduct(url: string): Promise<ScraperResult> {
    const canonicalUrl = canonicalizeAmazonIndiaUrl(url);
    const result = createBaseResult(this.storeId, canonicalUrl ?? url);

    if (!canonicalUrl) {
      result.error = "Amazon India only: unable to canonicalize URL to amazon.in";
      result.availability = false;
      return result;
    }

    try {
      const html = await safeFetch(canonicalUrl);
      const $ = cheerio.load(html);

      // Extract ASIN from URL
      const asinMatch = canonicalUrl.match(/\/dp\/([A-Z0-9]{10})/i) ||
        canonicalUrl.match(/\/gp\/product\/([A-Z0-9]{10})/i);
      result.externalId = asinMatch?.[1] ?? null;

      // Title
      result.title =
        $("#productTitle").text().trim() ||
        $("h1.a-size-large span").first().text().trim() ||
        $("h1#title span").text().trim();

      // Try JSON-LD first
      const jsonLd = extractJsonLd(html);
      if (jsonLd) {
        const { price, originalPrice, currency } = extractPriceFromJsonLd(jsonLd);
        if (price) {
          result.price = price;
          result.originalPrice = originalPrice;
          // Enforce India-only currency
          result.currency = currency?.toUpperCase() === AMAZON_CURRENCY
            ? AMAZON_CURRENCY
            : AMAZON_CURRENCY;
          result.extractedVia = "json-ld";
        }
      }

      // Fallback: CSS selectors for price
      if (!result.price) {
        const priceSelectors = [
          ".a-price .a-offscreen",
          "#priceblock_ourprice",
          "#priceblock_dealprice",
          ".priceToPay .a-offscreen",
          "#price_inside_buybox",
          "#newBuyBoxPrice",
          ".a-price-whole",
        ];

        for (const sel of priceSelectors) {
          const text = $(sel).first().text().trim();
          const price = parsePrice(text);
          if (price) {
            result.price = price;
            result.currency = AMAZON_CURRENCY;
            result.extractedVia = "selector";
            break;
          }
        }
      }

      // Original / MRP price
      if (!result.originalPrice) {
        const mrpText =
          $(".a-text-strike").first().text().trim() ||
          $(".basisPrice .a-offscreen").first().text().trim() ||
          $(".a-price.a-text-price .a-offscreen").first().text().trim();
        result.originalPrice = parsePrice(mrpText);
      }

      // Availability
      const availText = $("#availability span").text().trim().toLowerCase();
      result.availability = !availText.includes("unavailable") &&
        !availText.includes("out of stock");

      // Image
      result.image =
        $("#landingImage").attr("src") ||
        $("#imgBlkFront").attr("src") ||
        $("img#main-image").attr("src") ||
        null;

      // Seller
      result.seller =
        $("#sellerProfileTriggerId").text().trim() ||
        $("#merchantInfoFeature_feature_div .offer-display-feature-text-message")
          .text()
          .trim() ||
        null;

      // Rating
      const ratingText = $("span.a-icon-alt").first().text().trim();
      const ratingMatch = ratingText.match(/([\d.]+)\s*out\s*of/);
      result.rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

      // Review count
      const reviewText = $("#acrCustomerReviewText").text().trim();
      const reviewMatch = reviewText.match(/([\d,]+)/);
      result.reviewCount = reviewMatch
        ? parseInt(reviewMatch[1].replace(/,/g, ""), 10)
        : null;

      // Delivery
      result.deliveryInfo =
        $("#deliveryBlockMessage .a-text-bold").text().trim() || null;

    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
    }

    return result;
  }

  async searchProducts(query: string, limit = 5): Promise<ScraperSearchResult[]> {
    const results: ScraperSearchResult[] = [];
    try {
      const searchUrl = buildAmazonIndiaSearchUrl(query);
      const html = await safeFetch(searchUrl);
      const $ = cheerio.load(html);

      $("[data-component-type='s-search-result']").each((_i, el) => {
        if (results.length >= limit) return false;
        const asin = $(el).attr("data-asin");
        if (!asin) return;

        const title = $(el).find("h2 a span").text().trim();
        const priceText = $(el).find(".a-price .a-offscreen").first().text().trim();
        const image = $(el).find("img.s-image").attr("src") || null;
        const link = $(el).find("h2 a").attr("href");

        if (title && link) {
          results.push({
            title,
            url: buildAmazonIndiaProductUrl(asin),
            price: parsePrice(priceText),
            image,
            store: this.storeId,
          });
        }
      });
    } catch {
      // Return whatever we collected
    }
    return results;
  }
}
