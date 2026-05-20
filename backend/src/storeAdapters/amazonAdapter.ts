/**
 * Amazon Store Adapter — Searches and parses Amazon product listings.
 */

import * as cheerio from "cheerio";
import { BaseStoreAdapter, type StoreListing, type AdapterSearchOptions } from "./baseAdapter.js";
import {
  AMAZON_BASE_URL,
  AMAZON_CURRENCY,
  buildAmazonIndiaProductUrl,
  buildAmazonIndiaSearchUrl,
} from "../constants/amazon.js";

export class AmazonAdapter extends BaseStoreAdapter {
  readonly storeId = "amazon";
  readonly storeName = "Amazon";
  readonly baseUrl = AMAZON_BASE_URL;
  readonly currency = AMAZON_CURRENCY;
  readonly trustScore = 96;
  readonly defaultDeliveryInfo = "Free delivery on orders over ₹499";
  readonly defaultReturnPolicy = "10-day replacement";

  buildSearchUrl(query: string): string {
    return buildAmazonIndiaSearchUrl(query);
  }

  async searchProducts(query: string, options?: AdapterSearchOptions): Promise<StoreListing[]> {
    const limit = options?.limit ?? 3;
    const listings: StoreListing[] = [];

    try {
      const html = await this.fetchHtml(this.buildSearchUrl(query));
      const $ = cheerio.load(html);

      $("[data-component-type='s-search-result']").each((_i, el) => {
        if (listings.length >= limit) return false;
        const asin = $(el).attr("data-asin");
        if (!asin) return;

        // Skip sponsored items
        const adLabel = $(el).find('.puis-label-popover, .s-label-popover-default').text();
        if (adLabel.toLowerCase().includes('sponsored')) return;

        // Title: Amazon splits brand + product across different elements
        let title = $(el).find("a.a-link-normal .a-text-normal").text().trim();
        if (!title) title = $(el).find("h2 a span").text().trim();
        if (!title) title = $(el).find("h2").text().trim();

        const brandText = $(el).find("h2 span.a-size-medium.a-color-base").text().trim();
        if (brandText && title && !title.toLowerCase().startsWith(brandText.toLowerCase())) {
          title = `${brandText} ${title}`;
        }

        if (!title) return;

        // Price extraction
        let priceText = $(el).find(".a-price:not(.a-text-price) .a-offscreen").first().text().trim();
        if (!priceText) {
          const whole = $(el).find(".a-price:not(.a-text-price) .a-price-whole").text().replace(/[,.\s]/g, "").trim();
          const fraction = $(el).find(".a-price:not(.a-text-price) .a-price-fraction").text().trim();
          if (whole) priceText = `${whole}.${fraction || "00"}`;
        }

        const originalPriceText = $(el).find(".a-price.a-text-price .a-offscreen").first().text().trim();
        const image = $(el).find("img.s-image").attr("src") || null;
        const link = $(el).find("h2 a").attr("href") || $(el).find("a.a-link-normal").first().attr("href");
        const ratingText = $(el).find(".a-icon-alt").first().text();
        const reviewText = $(el).find(".a-size-base.s-underline-text").first().text();

        const price = this.parsePrice(priceText);
        if (!link || !price) return;

        // Canonical India PDP URL (no cross-region links)
        const url = buildAmazonIndiaProductUrl(asin);
        const listing = this.createBaseListing(title, price, url);
        listing.currency = AMAZON_CURRENCY;
        listing.externalId = asin;
        listing.image = image;
        listing.originalPrice = this.parsePrice(originalPriceText);

        const ratingMatch = ratingText.match(/([\d.]+)\s*out/);
        listing.rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        const reviewMatch = reviewText.match(/([\d,]+)/);
        listing.reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, ""), 10) : null;

        listings.push(listing);
      });
    } catch (err) {
      if (listings.length === 0) throw err;
    }

    return listings;
  }
}
