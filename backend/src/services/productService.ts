/**
 * Product Service — core business logic for the SmartCompare backend.
 *
 * Implements:
 * - Product identification (resolve DetectedProduct → canonical product)
 * - Cross-platform comparison assembly
 * - Price history retrieval
 *
 * Works against the in-memory store in development.
 * Will be extended to query PostgreSQL when USE_MEMORY_STORE=false.
 */

import { DatabaseStore } from "../store/databaseStore.js";
import { SearchService, type DiscoveredListing } from "./searchService.js";
import { PriceExtractor } from "./priceExtractor.js";
import type {
  DetectedProductInput,
  IdentifyResponse,
  CompareResponse,
  PriceHistoryResponse,
  ProductListing,
} from "../types.js";

// Known platform→seller mapping (trust scores and display names)
const PLATFORM_META: Record<string, { name: string; trustScore: number }> = {
  Amazon: { name: "Amazon.in", trustScore: 96 },
  BestBuy: { name: "Best Buy", trustScore: 94 },
  Walmart: { name: "Walmart.com", trustScore: 92 },
  eBay: { name: "eBay Top Seller", trustScore: 88 },
  Flipkart: { name: "Flipkart", trustScore: 90 },
};

export class ProductService {
  private searchService: SearchService;
  private priceExtractor: PriceExtractor;

  constructor(private store: DatabaseStore) {
    this.searchService = new SearchService();
    this.priceExtractor = new PriceExtractor(3); // concurrency limit
  }

  // -----------------------------------------------------------------
  // POST /api/product/identify
  // -----------------------------------------------------------------

  async identify(input: DetectedProductInput): Promise<IdentifyResponse> {
    // Step 1: Try to find existing canonical product
    let product =
      (input.gtin ? await this.store.findProductByGtin(input.gtin) : null) ||
      await this.store.findProductByTitleBrand(input.title, input.brand);

    let isNew = false;

    // Step 2: If not found, create a new canonical product
    if (!product) {
      isNew = true;
      product = await this.store.createProduct({
        brand: input.brand,
        model: this.extractModel(input.title, input.brand),
        gtin: input.gtin,
        canonicalTitle: input.title,
        category: null,
        image: input.image,
      });
    }

    // Step 3: Upsert the listing for the current page
    let currentListing = input.externalId
      ? await this.store.findListingByPlatformExternalId(
          input.platform,
          input.externalId,
        )
      : null;

    if (!currentListing) {
      // Ensure seller exists
      let seller = await this.store.findSellerByPlatform(input.platform);
      if (!seller) {
        const meta = PLATFORM_META[input.platform];
        seller = await this.store.addSeller({
          name: meta?.name || input.platform,
          platform: input.platform,
          trustScore: meta?.trustScore || 80,
        });
      }

      currentListing = await this.store.createListing({
        productId: product!.id,
        platform: input.platform,
        externalId: input.externalId,
        url: input.url,
        title: input.title,
        sellerId: seller.id,
        lastPrice: input.price,
        currency: input.currency,
      });

      // Record initial price point
      if (input.price !== null) {
        await this.store.addPriceHistory(
          currentListing.id,
          input.price,
          input.currency,
        );
      }
    } else if (
      input.price !== null &&
      currentListing.lastPrice !== input.price
    ) {
      // Price changed — update listing & record history
      await this.store.updateListingPrice(currentListing.id, input.price);
      await this.store.addPriceHistory(
        currentListing.id,
        input.price,
        input.currency,
      );
    }

    // Step 4: If this is a new product, discover real competitor listings
    // via search API (or fallback search URLs if no API key)
    if (isNew) {
      await this.discoverCompetitors(product.id, input);
    }

    // Step 5: Collect all listings for this product
    const allListings = await this.store.getListingsForProduct(product!.id);
    const listings = await Promise.all(allListings.map((l) => this.toProductListing(l)));

    return {
      productId: product!.id,
      canonicalTitle: product!.canonicalTitle,
      brand: product!.brand,
      category: product!.category,
      listings,
      searchLinks: [],
      matched: !isNew,
    };
  }

  // -----------------------------------------------------------------
  // POST /api/product/compare
  // -----------------------------------------------------------------

  async compare(
    productId: string,
    currentPlatform?: string,
  ): Promise<CompareResponse> {
    const allListings = await this.store.getListingsForProduct(productId);

    if (allListings.length === 0) {
      return {
        currentListing: null,
        competitors: [],
        priceStats: { lowest: 0, highest: 0, average: 0, lowestPlatform: "" },
      };
    }

    const mapped = await Promise.all(allListings.map((l) => this.toProductListing(l)));

    // Separate current listing from competitors
    const currentIdx = currentPlatform
      ? mapped.findIndex((l) => l.platform === currentPlatform)
      : 0;

    const currentListing = mapped[currentIdx] || mapped[0];
    const competitors = mapped.filter((_, i) => i !== currentIdx);

    // Calculate price stats
    const prices = mapped.filter((l) => l.price > 0).map((l) => l.price);
    const lowest = prices.length > 0 ? Math.min(...prices) : 0;
    const highest = prices.length > 0 ? Math.max(...prices) : 0;
    const average =
      prices.length > 0
        ? +(prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)
        : 0;
    const lowestListing = mapped.find((l) => l.price === lowest);

    return {
      currentListing,
      competitors,
      priceStats: {
        lowest,
        highest,
        average,
        lowestPlatform: lowestListing?.platform || "",
      },
    };
  }

  // -----------------------------------------------------------------
  // GET /api/product/history
  // -----------------------------------------------------------------

  async getHistory(productId: string): Promise<PriceHistoryResponse> {
    const history = await this.store.getHistoryForProduct(productId);

    const points = history.map((h) => ({
      timestamp: new Date(h.recordedAt).getTime(),
      price: h.price,
      vendor: "Store",
    }));

    const prices = points.map((p) => p.price);
    const allTimeLow = prices.length > 0 ? Math.min(...prices) : 0;
    const allTimeHigh = prices.length > 0 ? Math.max(...prices) : 0;

    // Last 30 days avg
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const recent = points.filter((p) => p.timestamp >= thirtyDaysAgo);
    const avg30d =
      recent.length > 0
        ? +(recent.reduce((s, p) => s + p.price, 0) / recent.length).toFixed(2)
        : 0;

    // Simple trend: compare first half vs second half of recent data
    let trend: "up" | "down" | "stable" = "stable";
    if (recent.length >= 4) {
      const mid = Math.floor(recent.length / 2);
      const firstHalfAvg =
        recent.slice(0, mid).reduce((s, p) => s + p.price, 0) / mid;
      const secondHalfAvg =
        recent.slice(mid).reduce((s, p) => s + p.price, 0) /
        (recent.length - mid);
      const diff = secondHalfAvg - firstHalfAvg;
      if (diff > avg30d * 0.02) trend = "up";
      else if (diff < -avg30d * 0.02) trend = "down";
    }

    return {
      productId,
      history: points,
      stats: { allTimeLow, allTimeHigh, avg30d, trend },
    };
  }

  // -----------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------

  /**
   * Discover real competitor listings via SearchService and persist them.
   * Falls back to search-page URLs when no search API key is configured.
   */
  private async discoverCompetitors(
    productId: string,
    source: DetectedProductInput,
  ): Promise<void> {
    const discovered = await this.searchService.discoverListings({
      title: source.title,
      brand: source.brand,
      model: this.extractModel(source.title, source.brand),
      gtin: source.gtin,
      currentPlatform: source.platform,
    });

    // --- Phase 2: Extract real prices from discovered URLs ---
    const extractionInputs = discovered.map((d) => ({
      platform: d.platform,
      title: d.title,
      url: d.url,
    }));

    const priceResults =
      await this.priceExtractor.extractPrices(extractionInputs);

    // Build a lookup from platform → extracted price
    const priceMap = new Map<string, { price: number; currency: string }>();
    for (const result of priceResults) {
      if (result.price !== null) {
        priceMap.set(result.platform, {
          price: result.price,
          currency: result.currency,
        });
      }
    }

    let extractedCount = 0;

    for (const listing of discovered) {
      const meta = PLATFORM_META[listing.platform];
      let seller = await this.store.findSellerByPlatform(listing.platform);
      if (!seller) {
        seller = await this.store.addSeller({
          name: meta?.name || listing.platform,
          platform: listing.platform,
          trustScore: meta?.trustScore || 80,
        });
      }

      // Use extracted price if available, else fall back to search snippet price
      const extracted = priceMap.get(listing.platform);
      const finalPrice = extracted?.price ?? listing.price;
      const finalCurrency = extracted?.currency ?? source.currency;

      if (extracted) extractedCount++;

      const storedListing = await this.store.createListing({
        productId,
        platform: listing.platform,
        externalId: null,
        url: listing.url,
        title: listing.title,
        sellerId: seller.id,
        lastPrice: finalPrice,
        currency: finalCurrency,
      });

      // Generate synthetic price history so charts have data immediately
      if (finalPrice) {
        await this.store.generateSyntheticHistory(
          storedListing.id,
          finalPrice,
          finalCurrency,
          30,
        );
      } else if (source.price) {
        // No price discovered — use source price as baseline for history
        await this.store.generateSyntheticHistory(
          storedListing.id,
          source.price,
          source.currency,
          30,
        );
      }
    }

    // Log extraction summary
    const failedExtractions = priceResults.filter((r) => r.price === null);
    console.log(
      `[ProductService] Discovered ${discovered.length} competitor listings ` +
        `(${discovered.filter((d) => d.discoveredVia === "search-api").length} via API, ` +
        `${discovered.filter((d) => d.discoveredVia === "fallback").length} fallback)`,
    );
    console.log(
      `[ProductService] Price extraction: ${extractedCount}/${discovered.length} succeeded`,
    );
    if (failedExtractions.length > 0) {
      for (const f of failedExtractions) {
        console.warn(
          `[ProductService] Price extraction failed for ${f.platform}: ${f.error}`,
        );
      }
    }
  }

  /** Best-effort model extraction from title. */
  private extractModel(title: string, brand: string | null): string | null {
    if (!brand) return null;
    // Remove brand name and common filler words to isolate model
    const cleaned = title
      .replace(new RegExp(brand, "gi"), "")
      .replace(/\(.*?\)/g, " ")
      .replace(/[-–—,]/g, " ")
      .trim();
    const words = cleaned.split(/\s+/).filter((w) => w.length > 1);
    return words.slice(0, 4).join(" ") || null;
  }

  /** Convert an internal listing record to the API response format. */
  private async toProductListing(listing: {
    platform: string;
    externalId: string | null;
    title: string;
    lastPrice: number | null;
    currency: string;
    url: string;
    sellerId: string | null;
    condition: string;
    inStock: boolean;
    lastChecked: string;
  }): Promise<ProductListing> {
    const seller = listing.sellerId
      ? await this.store.getSellerById(listing.sellerId)
      : null;
    return {
      platform: listing.platform,
      externalId: listing.externalId,
      title: listing.title,
      price: listing.lastPrice ?? 0,
      currency: listing.currency,
      url: listing.url,
      seller: seller?.name || listing.platform,
      sellerTrustScore: seller?.trustScore ?? 80,
      condition: listing.condition,
      inStock: listing.inStock,
      lastUpdated: listing.lastChecked,
    };
  }
}
