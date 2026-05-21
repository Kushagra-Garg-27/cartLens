/**
 * Drizzle ORM Schema — PostgreSQL table definitions.
 * Mirrors the existing schema.sql for the SmartCompare backend.
 */

import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ============================================================
// 1. PRODUCTS
// ============================================================

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brand: text("brand"),
    model: text("model"),
    gtin: text("gtin").unique(),
    asin: text("asin"),
    canonicalTitle: text("canonical_title").notNull(),
    category: text("category"),
    subcategory: text("subcategory"),
    image: text("image"),
    specs: jsonb("specs").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idxProductsCategory: index("idx_products_category").on(table.category),
    idxProductsBrandModel: index("idx_products_brand_model").on(table.brand, table.model),
  }),
);

// ============================================================
// 2. SELLERS
// ============================================================

export const sellers = pgTable(
  "sellers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    platform: text("platform").notNull(),
    trustScore: integer("trust_score").notNull().default(80),
    verified: boolean("verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idxSellersNamePlatform: uniqueIndex("idx_sellers_name_platform").on(table.name, table.platform),
  }),
);

// ============================================================
// 3. PRODUCT LISTINGS
// ============================================================

export const productListings = pgTable(
  "product_listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    store: text("store").notNull(),
    externalId: text("external_id"),
    url: text("url").notNull(),
    title: text("title").notNull(),
    sellerId: uuid("seller_id").references(() => sellers.id),
    lastPrice: numeric("last_price", { precision: 12, scale: 2 }),
    originalPrice: numeric("original_price", { precision: 12, scale: 2 }),
    currency: text("currency").notNull().default("INR"),
    condition: text("condition").notNull().default("New"),
    inStock: boolean("in_stock").notNull().default(true),
    deliveryInfo: text("delivery_info"),
    returnPolicy: text("return_policy"),
    rating: numeric("rating", { precision: 2, scale: 1 }),
    reviewCount: integer("review_count"),
    affiliateUrl: text("affiliate_url"),
    affiliateNetwork: text("affiliate_network"),
    lastChecked: timestamp("last_checked", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idxListingsProduct: index("idx_listings_product").on(table.productId),
    idxListingsStore: index("idx_listings_store").on(table.store),
    idxListingsStoreExternal: uniqueIndex("idx_listings_store_external").on(table.store, table.externalId),
  }),
);

// ============================================================
// 4. PRICE HISTORY
// ============================================================

export const priceHistory = pgTable(
  "price_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listingId: uuid("listing_id").notNull().references(() => productListings.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    store: text("store").notNull(),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("INR"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idxHistoryListing: index("idx_history_listing").on(table.listingId),
    idxHistoryProduct: index("idx_history_product").on(table.productId),
    idxHistoryTime: index("idx_history_time").on(table.recordedAt),
  }),
);

// ============================================================
// 5. DEALS
// ============================================================

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    productName: text("product_name").notNull(),
    productImage: text("product_image"),
    originalPrice: numeric("original_price", { precision: 12, scale: 2 }).notNull(),
    dealPrice: numeric("deal_price", { precision: 12, scale: 2 }).notNull(),
    discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }),
    dealScore: integer("deal_score"),
    store: text("store").notNull(),
    category: text("category"),
    isLimitedTime: boolean("is_limited_time").default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idxDealsStore: index("idx_deals_store").on(table.store),
    idxDealsScore: index("idx_deals_score").on(table.dealScore),
  }),
);

// ============================================================
// 6. WATCHLIST
// ============================================================

export const watchlist = pgTable(
  "watchlist",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    productName: text("product_name").notNull(),
    productImage: text("product_image"),
    productUrl: text("product_url"),
    store: text("store"),
    currentPrice: numeric("current_price", { precision: 12, scale: 2 }),
    alertPrice: numeric("alert_price", { precision: 12, scale: 2 }),
    trend: text("trend").default("stable"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idxWatchlistUser: index("idx_watchlist_user").on(table.userId),
  }),
);

// ============================================================
// 7. NOTIFICATIONS
// ============================================================

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    type: text("type").notNull().default("info"),
    read: boolean("read").notNull().default(false),
    link: text("link"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idxNotificationsUser: index("idx_notifications_user").on(table.userId),
  }),
);

// ============================================================
// 8. AFFILIATE CLICKS
// ============================================================

export const affiliateClicks = pgTable(
  "affiliate_clicks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id"),
    listingId: text("listing_id").notNull(),
    productId: text("product_id").notNull(),
    store: text("store").notNull(),
    affiliateNetwork: text("affiliate_network"),
    clickedAt: timestamp("clicked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idxAffiliateUser: index("idx_affiliate_user").on(table.userId),
  }),
);
