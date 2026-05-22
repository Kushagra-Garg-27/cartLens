/**
 * Store Registry — Dynamic store configuration system.
 *
 * New stores are added by registering a StoreConfig entry.
 * No core service code needs to change when adding a new store.
 */

import { AMAZON_BASE_URL, AMAZON_DOMAIN } from "../constants/amazon.js";

export interface StoreConfig {
  /** Unique store identifier (lowercase, no spaces) */
  id: string;
  /** Human-readable display name */
  displayName: string;
  /** Base domain(s) for URL matching */
  domains: string[];
  /** Default trust score (0–100) */
  trustScore: number;
  /** ISO 4217 currency code */
  currency: string;
  /** Country / region */
  region: "IN" | "US" | "UK" | "EU" | "GLOBAL";
  /** Whether the store is currently active for scraping */
  enabled: boolean;
  /** Logo URL or icon identifier */
  logo?: string;
  /** Search URL template — {query} is replaced with encoded search term */
  searchUrlTemplate: string;
  /** Product URL patterns (regex) for detection */
  productUrlPatterns: RegExp[];
  /** Default delivery info */
  deliveryInfo?: string;
  /** Default return policy */
  returnPolicy?: string;
}

// ============================================================
// STORE DEFINITIONS
// ============================================================

const STORES: StoreConfig[] = [
  {
    id: "amazon",
    displayName: "Amazon",
    domains: [AMAZON_DOMAIN],
    trustScore: 96,
    currency: "INR",
    region: "IN",
    enabled: true,
    logo: "amazon",
    searchUrlTemplate: `${AMAZON_BASE_URL}/s?k={query}`,
    productUrlPatterns: [/\/dp\/[A-Z0-9]{10}/, /\/gp\/product\/[A-Z0-9]{10}/],
    deliveryInfo: "Free delivery on orders over ₹499",
    returnPolicy: "10-day replacement",
  },
  {
    id: "flipkart",
    displayName: "Flipkart",
    domains: ["flipkart.com"],
    trustScore: 92,
    currency: "INR",
    region: "IN",
    enabled: true,
    logo: "flipkart",
    searchUrlTemplate: "https://www.flipkart.com/search?q={query}",
    productUrlPatterns: [/\/p\/itm[a-zA-Z0-9]+/, /\/product\//],
    deliveryInfo: "Free delivery on orders over ₹500",
    returnPolicy: "7-day replacement",
  },
  {
    id: "croma",
    displayName: "Croma",
    domains: ["croma.com"],
    trustScore: 90,
    currency: "INR",
    region: "IN",
    enabled: true,
    logo: "croma",
    searchUrlTemplate: "https://www.croma.com/search/?text={query}",
    productUrlPatterns: [/\/p\/\d+/, /croma\.com\/[^/]+-\d+/],
    deliveryInfo: "Free delivery available",
    returnPolicy: "14-day return policy",
  },
  {
    id: "reliance-digital",
    displayName: "Reliance Digital",
    domains: ["reliancedigital.in"],
    trustScore: 89,
    currency: "INR",
    region: "IN",
    enabled: true,
    logo: "reliance-digital",
    searchUrlTemplate: "https://www.reliancedigital.in/search?q={query}",
    productUrlPatterns: [/reliancedigital\.in\/[^/]+\/p\/\d+/],
    deliveryInfo: "Free shipping above ₹500",
    returnPolicy: "10-day return policy",
  },
  {
    id: "vijay-sales",
    displayName: "Vijay Sales",
    domains: ["vijaysales.com"],
    trustScore: 87,
    currency: "INR",
    region: "IN",
    enabled: true,
    logo: "vijay-sales",
    searchUrlTemplate: "https://www.vijaysales.com/search/{query}",
    productUrlPatterns: [/vijaysales\.com\/[^/]+-\d+/],
    deliveryInfo: "Free delivery on select products",
    returnPolicy: "7-day return policy",
  },
  // --- US / Global stores ---
  {
    id: "walmart",
    displayName: "Walmart",
    domains: ["walmart.com"],
    trustScore: 92,
    currency: "USD",
    region: "US",
    enabled: true,
    logo: "walmart",
    searchUrlTemplate: "https://www.walmart.com/search?q={query}",
    productUrlPatterns: [/walmart\.com\/ip\/[^/]+\/\d+/],
    deliveryInfo: "Free shipping on orders over $35",
    returnPolicy: "90-day return policy",
  },
  {
    id: "samsung-store",
    displayName: "Samsung Store",
    domains: ["samsung.com"],
    trustScore: 95,
    currency: "USD",
    region: "GLOBAL",
    enabled: false,
    logo: "samsung",
    searchUrlTemplate: "https://www.samsung.com/us/search/searchMain?searchTerm={query}",
    productUrlPatterns: [/samsung\.com\/us\/[^/]+\/[^/]+/],
    deliveryInfo: "Free standard shipping",
    returnPolicy: "15-day return policy",
  },
  // --- Secondary stores (can be enabled later) ---
  {
    id: "tata-cliq",
    displayName: "Tata CLiQ",
    domains: ["tatacliq.com"],
    trustScore: 88,
    currency: "INR",
    region: "IN",
    enabled: false,
    logo: "tata-cliq",
    searchUrlTemplate: "https://www.tatacliq.com/search/?searchCategory=all&text={query}",
    productUrlPatterns: [/tatacliq\.com\/[^/]+\/p-mp\d+/],
  },
  {
    id: "bestbuy",
    displayName: "Best Buy",
    domains: ["bestbuy.com"],
    trustScore: 94,
    currency: "USD",
    region: "US",
    enabled: true,
    logo: "bestbuy",
    searchUrlTemplate: "https://www.bestbuy.com/site/searchpage.jsp?st={query}",
    productUrlPatterns: [/bestbuy\.com\/site\/[^/]+\/\d+\.p/],
  },
  {
    id: "ebay",
    displayName: "eBay",
    domains: ["ebay.com", "ebay.in"],
    trustScore: 85,
    currency: "USD",
    region: "GLOBAL",
    enabled: true,
    logo: "ebay",
    searchUrlTemplate: "https://www.ebay.com/sch/i.html?_nkw={query}",
    productUrlPatterns: [/ebay\.com\/itm\/\d+/],
  },
  {
    id: "target",
    displayName: "Target",
    domains: ["target.com"],
    trustScore: 91,
    currency: "USD",
    region: "US",
    enabled: true,
    logo: "target",
    searchUrlTemplate: "https://www.target.com/s?searchTerm={query}",
    productUrlPatterns: [/target\.com\/p\/[^/]+-\/A-\d+/],
    deliveryInfo: "Free shipping on orders over $35",
    returnPolicy: "90-day return policy",
  },
  {
    id: "newegg",
    displayName: "Newegg",
    domains: ["newegg.com"],
    trustScore: 88,
    currency: "USD",
    region: "US",
    enabled: true,
    logo: "newegg",
    searchUrlTemplate: "https://www.newegg.com/p/pl?d={query}",
    productUrlPatterns: [/newegg\.com\/[^/]+\/p\/[A-Z0-9-]+/],
    deliveryInfo: "Free shipping on eligible items",
    returnPolicy: "30-day return policy",
  },
];

// ============================================================
// REGISTRY API
// ============================================================

class StoreRegistry {
  private stores = new Map<string, StoreConfig>();

  constructor() {
    for (const store of STORES) {
      this.stores.set(store.id, store);
    }
  }

  /** Get config for a specific store */
  get(storeId: string): StoreConfig | undefined {
    return this.stores.get(storeId);
  }

  /** Get all enabled stores */
  getEnabled(): StoreConfig[] {
    return Array.from(this.stores.values()).filter((s) => s.enabled);
  }

  /** Get all registered stores */
  getAll(): StoreConfig[] {
    return Array.from(this.stores.values());
  }

  /** Identify which store a URL belongs to */
  identifyStore(url: string): StoreConfig | undefined {
    const hostname = extractHostname(url);
    for (const store of this.stores.values()) {
      if (store.domains.some((d) => hostname.includes(d))) {
        return store;
      }
    }
    return undefined;
  }

  /** Check if a URL is a product page for any known store */
  isProductPage(url: string): { store: StoreConfig; isProduct: boolean } | undefined {
    const store = this.identifyStore(url);
    if (!store) return undefined;
    const isProduct = store.productUrlPatterns.some((p) => p.test(url));
    return { store, isProduct };
  }

  /** Build a search URL for a store */
  buildSearchUrl(storeId: string, query: string): string | null {
    const store = this.stores.get(storeId);
    if (!store) return null;
    return store.searchUrlTemplate.replace("{query}", encodeURIComponent(query));
  }

  /** Register a new store at runtime */
  register(config: StoreConfig): void {
    this.stores.set(config.id, config);
  }

  /** Enable/disable a store */
  setEnabled(storeId: string, enabled: boolean): void {
    const store = this.stores.get(storeId);
    if (store) store.enabled = enabled;
  }
}

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Singleton store registry */
export const storeRegistry = new StoreRegistry();
