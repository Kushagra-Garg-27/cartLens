/**
 * Price Aggregator Service — Central orchestration engine.
 *
 * Responsibilities:
 * 1. Identify canonical products
 * 2. Fetch store listings (cached or scraped)
 * 3. Normalize results across stores
 * 4. Rank stores by price
 * 5. Compute price statistics
 * 6. Returns unified comparison response
 */

import { DatabaseStore } from "../store/databaseStore.js";
import { ScraperManager } from "../scrapers/index.js";
import {
  cache,
  CacheKeys,
  CacheTTL,
  type CacheProvider,
} from "./cache.js";
import {
  normalizeProduct,
  titleSimilarity,
  buildSearchQueryFromFingerprint,
  type NormalizedProduct,
  type ProductFingerprint,
} from "./productNormalizer.js";
import { SearchService, type DiscoveredListing } from "./searchService.js";
import { currencyService } from "./currencyService.js";
import { adapterRegistry, type CrossMarketSearchResult } from "../storeAdapters/index.js";
import type { StoreListing as AdapterStoreListing } from "../storeAdapters/baseAdapter.js";
import { storeRegistry } from "../stores/registry.js";
import { AMAZON_CURRENCY, canonicalizeAmazonIndiaUrl } from "../constants/amazon.js";
import type { ScraperResult } from "../scrapers/base.js";
import type {
  DetectedProductInput,
  ProductListing,
  IdentifyResponse,
  CompareResponse,
  PriceHistoryResponse,
  SearchLink,
} from "../types.js";

/* ------------------------------------------------------------------ */
/* Live currency exchange rates are handled by CurrencyService        */
/* ------------------------------------------------------------------ */

export interface AggregatedResult {
  productId: string;
  canonicalTitle: string;
  brand: string | null;
  category: string | null;
  image: string | null;
  listings: StoreListing[];
  priceStats: PriceStats;
  metadata: {
    totalStoresSearched: number;
    storesWithResults: number;
    cachedResults: number;
    freshResults: number;
    lastUpdated: string;
  };
}

export interface StoreListing {
  store: string;
  storeDisplayName: string;
  title: string;
  price: number;
  originalPrice: number | null;
  currency: string;
  url: string;
  externalId: string | null;
  availability: boolean;
  seller: string | null;
  sellerTrustScore: number;
  rating: number | null;
  reviewCount: number | null;
  deliveryInfo: string | null;
  returnPolicy: string | null;
  image: string | null;
  lastUpdated: string;
}

export interface PriceStats {
  lowest: number;
  highest: number;
  average: number;
  median: number;
  lowestStore: string;
  highestStore: string;
  priceRange: number;
  savingsFromHighest: number;
  savingsPercent: number;
  listingCount: number;
}

export class PriceAggregatorService {
  private scraperManager: ScraperManager;
  private cacheProvider: CacheProvider;
  private searchService: SearchService;

  constructor(
    private store: DatabaseStore,
    scraperManager?: ScraperManager,
    cacheProvider?: CacheProvider,
  ) {
    this.scraperManager = scraperManager ?? new ScraperManager(3);
    this.cacheProvider = cacheProvider ?? cache;
    this.searchService = new SearchService();
  }

  /**
   * Main entry point: Identify a product and aggregate prices across all stores.
   */
  async identifyAndAggregate(
    input: DetectedProductInput,
  ): Promise<AggregatedResult> {
    input = this.normalizeAmazonIndiaInput(input);

    // Check cache first
    const cacheKey = CacheKeys.aggregation(
      `${input.title}:${input.platform}`,
    );
    const cached = await this.cacheProvider.get<AggregatedResult>(cacheKey);
    if (cached) return cached;

    // Step 1: Normalize the product
    const normalized = normalizeProduct(
      input.title,
      input.brand,
      input.gtin,
    );

    // Step 2: Find or create canonical product in store
    let product =
      (input.gtin ? await this.store.findProductByGtin(input.gtin) : null) ||
      await this.store.findProductByTitleBrand(input.title, input.brand);

    let isNew = false;

    if (!product) {
      isNew = true;
      product = await this.store.createProduct({
        brand: normalized.brand,
        model: normalized.model,
        gtin: normalized.identifiers.gtin,
        canonicalTitle: normalized.canonicalTitle,
        category: normalized.category,
        image: input.image,
      });
    }

    // Step 3: Upsert the current listing
    await this.upsertCurrentListing(product!.id, input);

    // Step 4: Fetch prices from all stores (adapters + scrapers + search)
    const fetchedListings = await this.fetchAllStorePrices(
      normalized,
      input,
      product!.id,
    );

    // Start with fetched listings
    const listings: StoreListing[] = [...fetchedListings];

    // Merge with DB listings (with currency normalization)
    const targetCurrency = input.currency.toUpperCase();
    const dbListings = await this.store.getListingsForProduct(product!.id);
    for (const dbListing of dbListings) {
      if (dbListing.lastPrice === null) continue;
      
      const storeId = dbListing.platform.toLowerCase();
      // Skip if we already have a scraped listing for this store
      if (listings.some((l) => l.store === storeId)) continue;
      
      // Normalize currency to match the source product
      let normalizedPrice = dbListing.lastPrice;
      let normalizedOriginalPrice = dbListing.originalPrice;
      let normalizedCurrency = dbListing.currency;
      const fromCurrency = dbListing.currency.toUpperCase();

      if (fromCurrency !== targetCurrency) {
        const rate = await currencyService.getExchangeRate(fromCurrency, targetCurrency);
        if (rate) {
          normalizedPrice = Math.round(normalizedPrice * rate * 100) / 100;
          normalizedOriginalPrice = normalizedOriginalPrice
            ? Math.round(normalizedOriginalPrice * rate * 100) / 100
            : null;
          normalizedCurrency = targetCurrency;
        } else {
          // Cannot normalize currency — skip this listing to avoid mixed-currency comparison
          continue;
        }
      }

      const storeConfig = storeRegistry.get(storeId);
      const seller = dbListing.sellerId ? await this.store.getSellerById(dbListing.sellerId) : null;
      
      listings.push({
        store: storeId,
        storeDisplayName: storeConfig?.displayName || dbListing.platform,
        title: dbListing.title,
        price: normalizedPrice,
        originalPrice: normalizedOriginalPrice,
        currency: normalizedCurrency,
        url: dbListing.url,
        externalId: dbListing.externalId,
        availability: dbListing.inStock,
        seller: seller?.name || storeConfig?.displayName || dbListing.platform,
        sellerTrustScore: seller?.trustScore || storeConfig?.trustScore || 80,
        rating: null,
        reviewCount: null,
        deliveryInfo: storeConfig?.deliveryInfo || null,
        returnPolicy: storeConfig?.returnPolicy || null,
        image: null,
        lastUpdated: dbListing.lastChecked
      });
    }

    // Step 6: Add the current page listing if it has a price
    if (input.price !== null) {
      const storeConfig = storeRegistry.identifyStore(input.url);
      const currentStoreListing: StoreListing = {
        store: input.platform.toLowerCase(),
        storeDisplayName: storeConfig?.displayName || input.platform,
        title: input.title,
        price: input.price,
        originalPrice: null,
        currency: input.currency,
        url: input.url,
        externalId: input.externalId,
        availability: true,
        seller: storeConfig?.displayName || input.platform,
        sellerTrustScore: storeConfig?.trustScore || 80,
        rating: null,
        reviewCount: null,
        deliveryInfo: storeConfig?.deliveryInfo || null,
        returnPolicy: storeConfig?.returnPolicy || null,
        image: input.image,
        lastUpdated: new Date().toISOString(),
      };

      // Avoid duplicates: Replace if already exists from DB, otherwise unshift
      const existingIdx = listings.findIndex(
        (l) => l.store === currentStoreListing.store,
      );
      if (existingIdx !== -1) {
        listings[existingIdx] = currentStoreListing; // use the freshest price
      } else {
        listings.unshift(currentStoreListing);
      }
    }

    // Step 7: Compute price statistics
    const priceStats = this.computePriceStats(listings);

    // Step 8: Persist competitor listings
    for (const listing of listings) {
      await this.persistListing(product!.id, listing);
    }

    const result: AggregatedResult = {
      productId: product!.id,
      canonicalTitle: normalized.canonicalTitle,
      brand: normalized.brand,
      category: normalized.category,
      image: input.image || listings.find((l) => l.image)?.image || null,
      listings: listings.sort((a, b) => a.price - b.price),
      priceStats,
      metadata: {
        totalStoresSearched: storeRegistry.getEnabled().length + adapterRegistry.getRegisteredIds().length,
        storesWithResults: listings.length,
        cachedResults: 0,
        freshResults: fetchedListings.length,
        lastUpdated: new Date().toISOString(),
      },
    };

    // Cache the result
    await this.cacheProvider.set(cacheKey, result, CacheTTL.LISTINGS);

    return result;
  }

  /**
   * Compare prices for an already-identified product.
   */
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
    const currentIdx = currentPlatform
      ? mapped.findIndex(
          (l) => l.platform.toLowerCase() === currentPlatform.toLowerCase(),
        )
      : 0;

    const currentListing = mapped[currentIdx] || mapped[0];
    const competitors = mapped.filter((_, i) => i !== currentIdx);

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

  /**
   * Get price history for a product.
   */
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

    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const recent = points.filter((p) => p.timestamp >= thirtyDaysAgo);
    const avg30d =
      recent.length > 0
        ? +(recent.reduce((s, p) => s + p.price, 0) / recent.length).toFixed(2)
        : 0;

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

  /**
   * Legacy identify endpoint response format.
   */
  async identify(input: DetectedProductInput): Promise<IdentifyResponse> {
    const aggregated = await this.identifyAndAggregate(input);

    const listings: ProductListing[] = aggregated.listings.map((l) => ({
      platform: l.store,
      externalId: l.externalId,
      title: l.title,
      price: l.price,
      currency: l.currency,
      url: l.url,
      seller: l.seller || l.storeDisplayName,
      sellerTrustScore: l.sellerTrustScore,
      condition: "New",
      inStock: l.availability,
      lastUpdated: l.lastUpdated,
    }));

    // Generate search links for stores that don't have a real listing
    const coveredStores = new Set(listings.map(l => l.platform.toLowerCase()));
    const searchLinks: SearchLink[] = this.buildSearchLinks(
      aggregated.canonicalTitle,
      coveredStores,
      input.platform,
    );

    return {
      productId: aggregated.productId,
      canonicalTitle: aggregated.canonicalTitle,
      brand: aggregated.brand,
      category: aggregated.category,
      listings,
      searchLinks,
      matched: true,
    };
  }

  // -----------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------

  private async fetchAllStorePrices(
    normalized: NormalizedProduct,
    input: DetectedProductInput,
    productId: string,
  ): Promise<StoreListing[]> {
    const currentStoreId = storeRegistry.identifyStore(input.url)?.id;
    const cacheKey = CacheKeys.aggregation(`adapter:${normalized.fingerprint.fingerprintKey}`);
    const cachedAdapterResults = await this.cacheProvider.get<StoreListing[]>(cacheKey);

    if (cachedAdapterResults) {
      return cachedAdapterResults;
    }

    // --- Source 1: Store Adapter Registry (primary, new system) ---
    // Run cross-marketplace search via adapters
    let adapterListings: StoreListing[] = [];
    try {
      const adapterResult: CrossMarketSearchResult = await adapterRegistry.searchAllStores(
        normalized.fingerprint,
        input.title,
        currentStoreId,
        { limit: 2, timeout: 15000 },
      );
      adapterListings = adapterResult.listings.map(al => this.fromAdapterListing(al));
      console.info(`[Aggregator] Adapters: ${adapterResult.stats.storesSearched} searched, ${adapterResult.stats.storesResponded} responded, ${adapterListings.length} listings (${adapterResult.stats.searchTimeMs}ms)`);
      if (adapterResult.errors.length > 0) {
        for (const e of adapterResult.errors) {
          console.warn(`[Aggregator] Adapter ${e.store}: ${e.error}`);
        }
      }
    } catch (err) {
      console.error("[Aggregator] Adapter search failed:", (err as Error).message);
    }

    // --- Source 2: Legacy Scrapers (existing scrapers for stores they cover) ---
    let scraperListings: StoreListing[] = [];
    try {
      const searchQuery = this.buildSearchQuery(normalized, input);
      const scraperResults = await this.fetchFromScrapers(normalized, input, productId, searchQuery);
      scraperListings = this.buildStoreListingsFromScraperResults(scraperResults, input);
    } catch (err) {
      console.error("[Aggregator] Scraper search failed:", (err as Error).message);
    }

    // --- Source 3: Search API Discovery (discovers listings via web search) ---
    let discoveredListings: StoreListing[] = [];
    try {
      const discovered = await this.searchService.discoverListings({
        title: input.title,
        brand: normalized.brand,
        model: normalized.model,
        gtin: normalized.identifiers.gtin,
        currentPlatform: input.platform,
      });
      discoveredListings = this.fromDiscoveredListings(discovered, input);
    } catch (err) {
      console.error("[Aggregator] Search discovery failed:", (err as Error).message);
    }

    // --- Merge all sources, deduplicating by store ---
    const mergedMap = new Map<string, StoreListing>();

    // Adapter results take priority (most reliable)
    for (const l of adapterListings) {
      const key = l.store;
      if (!mergedMap.has(key)) mergedMap.set(key, l);
    }
    // Scraper results fill gaps
    for (const l of scraperListings) {
      const key = l.store;
      if (!mergedMap.has(key)) mergedMap.set(key, l);
    }
    // Search discovery fills remaining gaps
    for (const l of discoveredListings) {
      const key = l.store;
      if (!mergedMap.has(key)) mergedMap.set(key, l);
    }

    const merged = Array.from(mergedMap.values());

    // --- Currency normalization ---
    // Convert all listings to the source product's currency.
    // Exclude listings where conversion would be unreliable (exotic currencies).
    const targetCurrency = input.currency.toUpperCase();
    const normalizedListings: StoreListing[] = [];
    for (const l of merged) {
      const fromCurrency = l.currency.toUpperCase();
      if (fromCurrency === targetCurrency) {
        normalizedListings.push(l);
      } else {
        const rate = await currencyService.getExchangeRate(fromCurrency, targetCurrency);
        if (rate) {
          normalizedListings.push({
            ...l,
            price: Math.round(l.price * rate * 100) / 100,
            originalPrice: l.originalPrice ? Math.round(l.originalPrice * rate * 100) / 100 : null,
            currency: targetCurrency,
          });
        }
        // If no rate available, skip the listing (don't mix currencies)
      }
    }

    // Cache the merged results
    if (normalizedListings.length > 0) {
      await this.cacheProvider.set(cacheKey, normalizedListings, CacheTTL.LISTINGS);
    }

    return normalizedListings;
  }

  /**
   * Fetch from the legacy scraper system.
   */
  private async fetchFromScrapers(
    normalized: NormalizedProduct,
    input: DetectedProductInput,
    productId: string,
    searchQuery: string,
  ): Promise<ScraperResult[]> {
    const currentStoreId = storeRegistry.identifyStore(input.url)?.id;
    const enabledStores = storeRegistry.getEnabled();
    const uncachedStores: string[] = [];
    const cachedResults: ScraperResult[] = [];

    for (const storeConfig of enabledStores) {
      if (storeConfig.id === currentStoreId) continue;

      const storeCacheKey = CacheKeys.storePrice(productId, storeConfig.id);
      const cachedResult = await this.cacheProvider.get<ScraperResult>(storeCacheKey);
      if (cachedResult) {
        cachedResults.push(cachedResult);
      } else {
        uncachedStores.push(storeConfig.id);
      }
    }

    const freshResults: ScraperResult[] = [];
    if (uncachedStores.length > 0) {
      const { results } = await this.scraperManager.scrapeAcrossStores(
        searchQuery,
        currentStoreId,
      );

      for (const result of results) {
        if (result.price !== null) {
          freshResults.push(result);
          const storeCacheKey = CacheKeys.storePrice(productId, result.store);
          await this.cacheProvider.set(storeCacheKey, result, CacheTTL.SCRAPER);
        }
      }
    }

    return [...cachedResults, ...freshResults];
  }

  /**
   * Convert adapter StoreListing to aggregator StoreListing.
   */
  private fromAdapterListing(al: AdapterStoreListing): StoreListing {
    return {
      store: al.storeId,
      storeDisplayName: al.storeName,
      title: al.title,
      price: al.price,
      originalPrice: al.originalPrice,
      currency: al.currency,
      url: al.productUrl,
      externalId: al.externalId,
      availability: al.availability,
      seller: al.seller,
      sellerTrustScore: al.storeReputation,
      rating: al.rating,
      reviewCount: al.reviewCount,
      deliveryInfo: al.deliveryInfo,
      returnPolicy: al.returnPolicy,
      image: al.image,
      lastUpdated: al.lastUpdated,
    };
  }

  /**
   * Convert search-discovered listings into aggregator StoreListings.
   * These may not have price data (search URL fallbacks).
   */
  private fromDiscoveredListings(
    discovered: DiscoveredListing[],
    input: DetectedProductInput,
  ): StoreListing[] {
    const results: StoreListing[] = [];
    // Minimum plausible price: 10% of source price, or $5 floor
    const minPrice = Math.max(5, (input.price ?? 0) * 0.10);
    for (const d of discovered) {
      if (!d.price) continue; // Skip fallbacks without prices
      if (d.price < minPrice) continue; // Skip clearly bogus prices (e.g. shipping thresholds)
      const storeConfig = storeRegistry.getAll().find(
        s => s.displayName.toLowerCase() === d.platform.toLowerCase()
      );

      results.push({
        store: d.platform.toLowerCase(),
        storeDisplayName: d.platform,
        title: d.title,
        price: d.price,
        originalPrice: null,
        currency: input.currency,
        url: d.url,
        externalId: null,
        availability: true, // Discovered listings with a price are presumed in-stock
        seller: d.platform,
        sellerTrustScore: storeConfig?.trustScore || 80,
        rating: null,
        reviewCount: null,
        deliveryInfo: storeConfig?.deliveryInfo || null,
        returnPolicy: storeConfig?.returnPolicy || null,
        image: null,
        lastUpdated: new Date().toISOString(),
      });
    }
    return results;
  }

  private buildSearchQuery(
    normalized: NormalizedProduct,
    input: DetectedProductInput,
  ): string {
    const parts: string[] = [];
    if (normalized.brand) parts.push(normalized.brand);
    if (normalized.model) parts.push(normalized.model);

    if (parts.length < 2) {
      // Fallback: use key words from title
      const words = input.title
        .split(/\s+/)
        .filter(
          (w) =>
            w.length > 2 &&
            !["buy", "online", "best", "price", "new", "the", "for"].includes(
              w.toLowerCase(),
            ),
        )
        .slice(0, 6);
      return words.join(" ");
    }

    return parts.join(" ");
  }

  private normalizeAmazonIndiaInput(input: DetectedProductInput): DetectedProductInput {
    const platform = (input.platform || "").toLowerCase();
    if (platform !== "amazon") return input;

    const canonicalUrl = canonicalizeAmazonIndiaUrl(input.url) ?? input.url;
    const incomingCurrency = (input.currency || "").toUpperCase();
    const price = incomingCurrency === AMAZON_CURRENCY ? input.price : null;

    return {
      ...input,
      platform: "amazon",
      url: canonicalUrl,
      currency: AMAZON_CURRENCY,
      price,
    };
  }

  /** Generate search URLs for stores without real listings. */
  private buildSearchLinks(
    canonicalTitle: string,
    coveredStores: Set<string>,
    currentPlatform: string,
  ): SearchLink[] {
    const SEARCH_STORE_IDS = [
      "amazon",
      "walmart",
      "bestbuy",
      "ebay",
      "target",
      "newegg",
      "flipkart",
    ] as const;

    const links: SearchLink[] = [];
    const current = currentPlatform.toLowerCase();

    for (const storeId of SEARCH_STORE_IDS) {
      if (coveredStores.has(storeId) || storeId === current) continue;
      const url = storeRegistry.buildSearchUrl(storeId, canonicalTitle);
      if (!url) continue;
      const store = storeRegistry.get(storeId);
      links.push({
        platform: storeId,
        displayName: store?.displayName || storeId,
        url,
      });
    }

    return links;
  }

  private buildStoreListingsFromScraperResults(
    scrapeResults: ScraperResult[],
    input: DetectedProductInput,
  ): StoreListing[] {
    const listings: StoreListing[] = [];

    for (const result of scrapeResults) {
      if (result.price === null) continue;

      const storeConfig = storeRegistry.get(result.store);

      // Verify this is actually a similar product
      const similarity = titleSimilarity(input.title, result.title);
      if (similarity < 0.5 && result.title.length > 0) continue;

      listings.push({
        store: result.store,
        storeDisplayName: storeConfig?.displayName || result.store,
        title: result.title,
        price: result.price,
        originalPrice: result.originalPrice,
        currency: result.currency,
        url: result.url,
        externalId: result.externalId,
        availability: result.availability,
        seller: result.seller,
        sellerTrustScore: storeConfig?.trustScore || 80,
        rating: result.rating,
        reviewCount: result.reviewCount,
        deliveryInfo: result.deliveryInfo || storeConfig?.deliveryInfo || null,
        returnPolicy:
          result.returnPolicy || storeConfig?.returnPolicy || null,
        image: result.image,
        lastUpdated: result.scrapedAt,
      });
    }

    return listings;
  }

  private computePriceStats(listings: StoreListing[]): PriceStats {
    // Only consider in-stock listings with valid prices for best-price determination
    const validListings = listings.filter((l) => l.price > 0 && l.availability !== false);
    const prices = validListings
      .map((l) => l.price)
      .sort((a, b) => a - b);

    if (prices.length === 0) {
      return {
        lowest: 0,
        highest: 0,
        average: 0,
        median: 0,
        lowestStore: "",
        highestStore: "",
        priceRange: 0,
        savingsFromHighest: 0,
        savingsPercent: 0,
        listingCount: 0,
      };
    }

    const lowest = prices[0];
    const highest = prices[prices.length - 1];
    const average = +(prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2);
    const median =
      prices.length % 2 === 0
        ? +((prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2).toFixed(2)
        : prices[Math.floor(prices.length / 2)];

    const lowestListing = validListings.find((l) => l.price === lowest);
    const highestListing = validListings.find((l) => l.price === highest);

    return {
      lowest,
      highest,
      average,
      median,
      lowestStore: lowestListing?.storeDisplayName || "",
      highestStore: highestListing?.storeDisplayName || "",
      priceRange: +(highest - lowest).toFixed(2),
      savingsFromHighest: +(highest - lowest).toFixed(2),
      savingsPercent:
        highest > 0 ? +(((highest - lowest) / highest) * 100).toFixed(1) : 0,
      listingCount: listings.length,
    };
  }

  private async upsertCurrentListing(
    productId: string,
    input: DetectedProductInput,
  ): Promise<void> {
    let currentListing = input.externalId
      ? await this.store.findListingByPlatformExternalId(
          input.platform,
          input.externalId,
        )
      : null;

    if (!currentListing) {
      let seller = await this.store.findSellerByPlatform(input.platform);
      if (!seller) {
        const storeConfig = storeRegistry.identifyStore(input.url);
        seller = await this.store.addSeller({
          name: storeConfig?.displayName || input.platform,
          platform: input.platform,
          trustScore: storeConfig?.trustScore || 80,
        });
      }

      currentListing = await this.store.createListing({
        productId,
        platform: input.platform,
        externalId: input.externalId,
        url: input.url,
        title: input.title,
        sellerId: seller.id,
        lastPrice: input.price,
        currency: input.currency,
      });

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
      await this.store.updateListingPrice(currentListing.id, input.price);
      await this.store.addPriceHistory(
        currentListing.id,
        input.price,
        input.currency,
      );
    }
  }

  private async persistListing(productId: string, listing: StoreListing): Promise<void> {
    const existing = listing.externalId
      ? await this.store.findListingByPlatformExternalId(
          listing.store,
          listing.externalId,
        )
      : null;

    if (existing) {
      if (listing.price !== existing.lastPrice) {
        await this.store.updateListingPrice(existing.id, listing.price);
        await this.store.addPriceHistory(existing.id, listing.price, listing.currency);
      }
      return;
    }

    let seller = await this.store.findSellerByPlatform(listing.store);
    if (!seller) {
      seller = await this.store.addSeller({
        name: listing.seller || listing.storeDisplayName,
        platform: listing.store,
        trustScore: listing.sellerTrustScore,
      });
    }

    const stored = await this.store.createListing({
      productId,
      platform: listing.store,
      externalId: listing.externalId,
      url: listing.url,
      title: listing.title,
      sellerId: seller.id,
      lastPrice: listing.price,
      currency: listing.currency,
    });

    if (listing.price > 0) {
      await this.store.generateSyntheticHistory(
        stored.id,
        listing.price,
        listing.currency,
        30,
      );
    }
  }

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
