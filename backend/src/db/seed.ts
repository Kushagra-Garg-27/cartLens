/**
 * Seed the database with sample product data.
 * Run: npm run db:seed
 *
 * This can work with either PostgreSQL (DatabaseStore) or the in-memory store
 * depending on environment config.
 */
import { MemoryStore } from "../store/memoryStore.js";
import { DatabaseStore } from "../store/databaseStore.js";
import { AMAZON_BASE_URL, AMAZON_CURRENCY } from "../constants/amazon.js";

/**
 * Populates the in-memory store with structured placeholder data (synchronous).
 */
export function seedMemoryStore(store: MemoryStore): void {
  // --- Sellers ---
  const sellers = [
    {
      id: "seller-amazon",
      name: "Amazon.in",
      platform: "Amazon",
      trustScore: 96,
    },
    {
      id: "seller-bestbuy",
      name: "Best Buy",
      platform: "BestBuy",
      trustScore: 94,
    },
    {
      id: "seller-walmart",
      name: "Walmart.com",
      platform: "Walmart",
      trustScore: 92,
    },
    {
      id: "seller-ebay-top",
      name: "TopRatedSeller",
      platform: "eBay",
      trustScore: 88,
    },
    {
      id: "seller-flipkart",
      name: "Flipkart",
      platform: "Flipkart",
      trustScore: 90,
    },
    {
      id: "seller-apple",
      name: "Apple Store",
      platform: "Direct",
      trustScore: 99,
    },
  ];
  sellers.forEach((s) => store.addSeller(s));

  // --- Products ---
  const products = [
    {
      brand: "Apple",
      model: "MacBook Air M3",
      gtin: "195949185694",
      canonicalTitle: "Apple MacBook Air 15-inch M3 Chip 16GB RAM 512GB SSD",
      category: "Electronics",
      subcategory: "Laptops",
      image:
        "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/macbook-air-midnight-select-20220606",
      specs: {
        processor: "Apple M3",
        ram: "16GB",
        storage: "512GB SSD",
        display: '15.3" Liquid Retina',
      },
    },
    {
      brand: "Sony",
      model: "WH-1000XM5",
      gtin: "027242923782",
      canonicalTitle:
        "Sony WH-1000XM5 Wireless Noise Cancelling Headphones Black",
      category: "Electronics",
      subcategory: "Headphones",
      image: null,
      specs: {
        type: "Over-ear",
        noiseCancelling: true,
        batteryLife: "30 hours",
        connectivity: "Bluetooth 5.2",
      },
    },
    {
      brand: "Samsung",
      model: "Galaxy S24 Ultra",
      gtin: "887276789200",
      canonicalTitle:
        "Samsung Galaxy S24 Ultra 256GB Titanium Black Unlocked",
      category: "Electronics",
      subcategory: "Smartphones",
      image: null,
      specs: {
        processor: "Snapdragon 8 Gen 3",
        ram: "12GB",
        storage: "256GB",
        display: '6.8" QHD+ Dynamic AMOLED',
      },
    },
    {
      brand: "Dyson",
      model: "V15 Detect",
      gtin: "885609024608",
      canonicalTitle: "Dyson V15 Detect Absolute Cordless Vacuum Cleaner",
      category: "Home",
      subcategory: "Vacuums",
      image: null,
      specs: {
        type: "Cordless Stick",
        batteryLife: "60 minutes",
        suction: "230 AW",
        weight: "6.8 lbs",
      },
    },
    {
      brand: "Nike",
      model: "Air Max 270",
      gtin: "194500780545",
      canonicalTitle: "Nike Air Max 270 Men's Running Shoes Black/White",
      category: "Fashion",
      subcategory: "Shoes",
      image:
        "https://static.nike.com/a/images/t_PDP_1728_v1/f_auto,q_auto:eco/awjogtfz2bpvczclfy7f/air-max-270-shoes-2V5C4p.png",
      specs: {
        type: "Running",
        material: "Mesh/Synthetic",
        sole: "Air Max unit",
        fit: "True to size",
      },
    },
  ];

  const createdProducts: ReturnType<typeof store.createProduct>[] = [];
  for (const p of products) {
    createdProducts.push(store.createProduct(p));
  }

  // --- Listings per product ---
  const platformListings = [
    { platform: "Amazon", sellerId: "seller-amazon", priceMultiplier: 1.0 },
    { platform: "BestBuy", sellerId: "seller-bestbuy", priceMultiplier: 1.02 },
    { platform: "Walmart", sellerId: "seller-walmart", priceMultiplier: 0.97 },
    { platform: "eBay", sellerId: "seller-ebay-top", priceMultiplier: 0.93 },
    {
      platform: "Flipkart",
      sellerId: "seller-flipkart",
      priceMultiplier: 0.95,
    },
  ];

  const basePrices = [1299, 348, 1199.99, 749.99, 150];

  for (let pi = 0; pi < createdProducts.length; pi++) {
    const product = createdProducts[pi];
    const basePrice = basePrices[pi];

    for (const pl of platformListings) {
      const price = +(basePrice * pl.priceMultiplier).toFixed(2);
      const originalPrice = +(price * 1.15).toFixed(2);
      const isAmazon = pl.platform === "Amazon";
      const currency = isAmazon ? AMAZON_CURRENCY : "USD";
      const listing = store.createListing({
        productId: product.id,
        platform: pl.platform,
        externalId: `${pl.platform.toLowerCase()}-${product.id.slice(0, 8)}`,
        url: isAmazon
          ? `${AMAZON_BASE_URL}/dp/${product.id.slice(0, 8)}`
          : `https://${pl.platform.toLowerCase()}.com/dp/${product.id.slice(0, 8)}`,
        title: product.canonicalTitle,
        sellerId: pl.sellerId,
        lastPrice: price,
        currency,
        originalPrice,
        affiliateUrl: isAmazon
          ? null
          : `https://affiliate.${pl.platform.toLowerCase()}.com/track?id=${product.id.slice(0, 8)}`,
        affiliateNetwork: pl.platform === "Amazon" ? "Amazon Associates" : null,
      });

      // Generate synthetic price history
      store.generateSyntheticHistory(listing.id, price, currency, 90);
    }
  }

  // --- Deals ---
  const dealData = [
    {
      productId: createdProducts[0].id,
      productName: "Apple MacBook Air 15-inch M3",
      productImage: createdProducts[0].image,
      originalPrice: 1499,
      dealPrice: 1199,
      discountPercent: 20,
      dealScore: 92,
      store: "Amazon",
      category: "Electronics",
      isLimitedTime: true,
      expiresAt: new Date(Date.now() + 3 * 86400000).toISOString(),
    },
    {
      productId: createdProducts[1].id,
      productName: "Sony WH-1000XM5 Noise Cancelling Headphones",
      productImage: createdProducts[1].image,
      originalPrice: 399.99,
      dealPrice: 278,
      discountPercent: 30,
      dealScore: 95,
      store: "BestBuy",
      category: "Electronics",
      isLimitedTime: false,
      expiresAt: null,
    },
    {
      productId: createdProducts[2].id,
      productName: "Samsung Galaxy S24 Ultra 256GB",
      productImage: createdProducts[2].image,
      originalPrice: 1299.99,
      dealPrice: 999.99,
      discountPercent: 23,
      dealScore: 88,
      store: "Walmart",
      category: "Electronics",
      isLimitedTime: true,
      expiresAt: new Date(Date.now() + 1 * 86400000).toISOString(),
    },
    {
      productId: createdProducts[3].id,
      productName: "Dyson V15 Detect Absolute",
      productImage: createdProducts[3].image,
      originalPrice: 749.99,
      dealPrice: 549.99,
      discountPercent: 27,
      dealScore: 90,
      store: "Amazon",
      category: "Home",
      isLimitedTime: false,
      expiresAt: null,
    },
    {
      productId: createdProducts[4].id,
      productName: "Nike Air Max 270 Running Shoes",
      productImage: createdProducts[4].image,
      originalPrice: 160,
      dealPrice: 109.99,
      discountPercent: 31,
      dealScore: 87,
      store: "eBay",
      category: "Fashion",
      isLimitedTime: true,
      expiresAt: new Date(Date.now() + 5 * 86400000).toISOString(),
    },
  ];

  for (const d of dealData) {
    store.addDeal(d);
  }

  // --- Seed demo user data (userId = "demo-user") ---
  const demoUserId = "demo-user";

  // Watchlist items
  for (let i = 0; i < 3; i++) {
    const p = createdProducts[i];
    const listings = store.getListingsForProduct(p.id);
    const listing = listings[0];
    store.addWatchlistItem({
      userId: demoUserId,
      productName: p.canonicalTitle,
      productImage: p.image,
      productUrl: listing?.url || null,
      store: listing?.platform || "Amazon",
      currentPrice: listing?.lastPrice || 0,
      alertPrice:
        listing?.lastPrice ? +(listing.lastPrice * 0.9).toFixed(2) : null,
      trend: i === 0 ? "down" : i === 1 ? "stable" : "up",
    });
  }

  // Notifications
  const notificationData = [
    {
      userId: demoUserId,
      title: "Price Drop Alert",
      message:
        "Sony WH-1000XM5 dropped to $278 — 30% below your alert price!",
      type: "price_alert",
      read: false,
      link: `/products/${createdProducts[1].id}`,
    },
    {
      userId: demoUserId,
      title: "Deal Expiring Soon",
      message:
        "The Samsung Galaxy S24 Ultra deal at Walmart expires in 24 hours.",
      type: "deal_expiry",
      read: false,
      link: `/products/${createdProducts[2].id}`,
    },
    {
      userId: demoUserId,
      title: "New Lower Price Found",
      message:
        "We found Apple MacBook Air M3 for $1,199 on Amazon — $100 less than your tracked price.",
      type: "price_alert",
      read: true,
      link: `/products/${createdProducts[0].id}`,
    },
    {
      userId: demoUserId,
      title: "Welcome to SmartCompare!",
      message:
        "Track prices, compare deals, and get AI-powered shopping insights.",
      type: "system",
      read: true,
      link: null,
    },
  ];

  for (const n of notificationData) {
    store.addNotification(n);
  }

  console.log(
    `[seed] Loaded ${sellers.length} sellers, ${createdProducts.length} products, ` +
      `${dealData.length} deals, 3 watchlist items, ${notificationData.length} notifications.`,
  );
}

/**
 * Seeds the PostgreSQL database via DatabaseStore (async).
 * Same data as seedMemoryStore but awaiting all async operations.
 */
export async function seedDatabaseStore(store: DatabaseStore): Promise<void> {
  // --- Sellers (no hardcoded IDs — let PostgreSQL generate UUIDs) ---
  const sellerDefs = [
    { name: "Amazon.in", platform: "Amazon", trustScore: 96 },
    { name: "Best Buy", platform: "BestBuy", trustScore: 94 },
    { name: "Walmart.com", platform: "Walmart", trustScore: 92 },
    { name: "TopRatedSeller", platform: "eBay", trustScore: 88 },
    { name: "Flipkart", platform: "Flipkart", trustScore: 90 },
    { name: "Apple Store", platform: "Direct", trustScore: 99 },
  ];
  const sellerMap = new Map<string, string>(); // platform → UUID
  for (const s of sellerDefs) {
    const created = await store.addSeller(s);
    sellerMap.set(s.platform, created.id);
  }

  // --- Products ---
  const productData = [
    {
      brand: "Apple", model: "MacBook Air M3", gtin: "195949185694",
      canonicalTitle: "Apple MacBook Air 15-inch M3 Chip 16GB RAM 512GB SSD",
      category: "Electronics", subcategory: "Laptops",
      image: "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/macbook-air-midnight-select-20220606",
      specs: { processor: "Apple M3", ram: "16GB", storage: "512GB SSD", display: '15.3" Liquid Retina' },
    },
    {
      brand: "Sony", model: "WH-1000XM5", gtin: "027242923782",
      canonicalTitle: "Sony WH-1000XM5 Wireless Noise Cancelling Headphones Black",
      category: "Electronics", subcategory: "Headphones",
      image: null,
      specs: { type: "Over-ear", noiseCancelling: true, batteryLife: "30 hours", connectivity: "Bluetooth 5.2" },
    },
    {
      brand: "Samsung", model: "Galaxy S24 Ultra", gtin: "887276789200",
      canonicalTitle: "Samsung Galaxy S24 Ultra 256GB Titanium Black Unlocked",
      category: "Electronics", subcategory: "Smartphones",
      image: null,
      specs: { processor: "Snapdragon 8 Gen 3", ram: "12GB", storage: "256GB", display: '6.8" QHD+ Dynamic AMOLED' },
    },
    {
      brand: "Dyson", model: "V15 Detect", gtin: "885609024608",
      canonicalTitle: "Dyson V15 Detect Absolute Cordless Vacuum Cleaner",
      category: "Home", subcategory: "Vacuums",
      image: null,
      specs: { type: "Cordless Stick", batteryLife: "60 minutes", suction: "230 AW", weight: "6.8 lbs" },
    },
    {
      brand: "Nike", model: "Air Max 270", gtin: "194500780545",
      canonicalTitle: "Nike Air Max 270 Men's Running Shoes Black/White",
      category: "Fashion", subcategory: "Shoes",
      image: "https://static.nike.com/a/images/t_PDP_1728_v1/f_auto,q_auto:eco/awjogtfz2bpvczclfy7f/air-max-270-shoes-2V5C4p.png",
      specs: { type: "Running", material: "Mesh/Synthetic", sole: "Air Max unit", fit: "True to size" },
    },
  ];

  const createdProducts = [];
  for (const p of productData) {
    createdProducts.push(await store.createProduct(p));
  }

  // --- Listings per product ---
  const platformListings = [
    { platform: "Amazon", priceMultiplier: 1.0 },
    { platform: "BestBuy", priceMultiplier: 1.02 },
    { platform: "Walmart", priceMultiplier: 0.97 },
    { platform: "eBay", priceMultiplier: 0.93 },
    { platform: "Flipkart", priceMultiplier: 0.95 },
  ];

  const basePrices = [1299, 348, 1199.99, 749.99, 150];

  for (let pi = 0; pi < createdProducts.length; pi++) {
    const product = createdProducts[pi];
    const basePrice = basePrices[pi];

    for (const pl of platformListings) {
      const price = +(basePrice * pl.priceMultiplier).toFixed(2);
      const originalPrice = +(price * 1.15).toFixed(2);
      const isAmazon = pl.platform === "Amazon";
      const currency = isAmazon ? AMAZON_CURRENCY : "USD";
      const listing = await store.createListing({
        productId: product.id,
        platform: pl.platform,
        externalId: `${pl.platform.toLowerCase()}-${product.id.slice(0, 8)}`,
        url: pl.platform === "Amazon"
          ? `${AMAZON_BASE_URL}/dp/${product.id.slice(0, 8)}`
          : `https://${pl.platform.toLowerCase()}.com/dp/${product.id.slice(0, 8)}`,
        title: product.canonicalTitle,
        sellerId: sellerMap.get(pl.platform) || null,
        lastPrice: price,
        currency,
        originalPrice,
        affiliateUrl: isAmazon
          ? null
          : `https://affiliate.${pl.platform.toLowerCase()}.com/track?id=${product.id.slice(0, 8)}`,
        affiliateNetwork: pl.platform === "Amazon" ? "Amazon Associates" : null,
      });

      await store.generateSyntheticHistory(listing.id, price, currency, 90);
    }
  }

  // --- Deals ---
  const dealData = [
    { productId: createdProducts[0].id, productName: "Apple MacBook Air 15-inch M3", productImage: createdProducts[0].image, originalPrice: 1499, dealPrice: 1199, discountPercent: 20, dealScore: 92, store: "Amazon", category: "Electronics", isLimitedTime: true, expiresAt: new Date(Date.now() + 3 * 86400000).toISOString() },
    { productId: createdProducts[1].id, productName: "Sony WH-1000XM5 Noise Cancelling Headphones", productImage: createdProducts[1].image, originalPrice: 399.99, dealPrice: 278, discountPercent: 30, dealScore: 95, store: "BestBuy", category: "Electronics", isLimitedTime: false, expiresAt: null },
    { productId: createdProducts[2].id, productName: "Samsung Galaxy S24 Ultra 256GB", productImage: createdProducts[2].image, originalPrice: 1299.99, dealPrice: 999.99, discountPercent: 23, dealScore: 88, store: "Walmart", category: "Electronics", isLimitedTime: true, expiresAt: new Date(Date.now() + 1 * 86400000).toISOString() },
    { productId: createdProducts[3].id, productName: "Dyson V15 Detect Absolute", productImage: createdProducts[3].image, originalPrice: 749.99, dealPrice: 549.99, discountPercent: 27, dealScore: 90, store: "Amazon", category: "Home", isLimitedTime: false, expiresAt: null },
    { productId: createdProducts[4].id, productName: "Nike Air Max 270 Running Shoes", productImage: createdProducts[4].image, originalPrice: 160, dealPrice: 109.99, discountPercent: 31, dealScore: 87, store: "eBay", category: "Fashion", isLimitedTime: true, expiresAt: new Date(Date.now() + 5 * 86400000).toISOString() },
  ];

  for (const d of dealData) {
    await store.addDeal(d);
  }

  // --- Seed demo user ---
  const demoUserId = "demo-user";

  for (let i = 0; i < 3; i++) {
    const p = createdProducts[i];
    const listings = await store.getListingsForProduct(p.id);
    const listing = listings[0];
    await store.addWatchlistItem({
      userId: demoUserId,
      productName: p.canonicalTitle,
      productImage: p.image,
      productUrl: listing?.url || null,
      store: listing?.platform || "Amazon",
      currentPrice: listing?.lastPrice || 0,
      alertPrice: listing?.lastPrice ? +(listing.lastPrice * 0.9).toFixed(2) : null,
      trend: i === 0 ? "down" : i === 1 ? "stable" : "up",
    });
  }

  const notificationData = [
    { userId: demoUserId, title: "Price Drop Alert", message: "Sony WH-1000XM5 dropped to $278 — 30% below your alert price!", type: "price_alert", read: false, link: `/products/${createdProducts[1].id}` },
    { userId: demoUserId, title: "Deal Expiring Soon", message: "The Samsung Galaxy S24 Ultra deal at Walmart expires in 24 hours.", type: "deal_expiry", read: false, link: `/products/${createdProducts[2].id}` },
    { userId: demoUserId, title: "New Lower Price Found", message: "We found Apple MacBook Air M3 for $1,199 on Amazon — $100 less than your tracked price.", type: "price_alert", read: true, link: `/products/${createdProducts[0].id}` },
    { userId: demoUserId, title: "Welcome to SmartCompare!", message: "Track prices, compare deals, and get AI-powered shopping insights.", type: "system", read: true, link: null },
  ];

  for (const n of notificationData) {
    await store.addNotification(n);
  }

  console.log(
    `[seed] PostgreSQL seeded: ${sellerDefs.length} sellers, ${createdProducts.length} products, ` +
      `${dealData.length} deals, 3 watchlist items, ${notificationData.length} notifications.`,
  );
}

// --- CLI entry point ---
// Run directly: npx tsx src/db/seed.ts
if (process.argv[1]?.includes("seed")) {
  const store = new DatabaseStore();
  seedDatabaseStore(store)
    .then(() => {
      console.log("[seed] Database seeding complete!");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[seed] Seeding failed:", err);
      process.exit(1);
    });
}
