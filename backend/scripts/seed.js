/**
 * Seed script — inserts 30 products with associated listings across all categories.
 * Idempotent: uses ON CONFLICT DO NOTHING.
 * Category-aware platform assignment: grocery products only get grocery platforms, etc.
 *
 * Usage: node scripts/seed.js
 */
require("dotenv").config();
const { pool, query } = require("../src/db");

const PLATFORMS_BY_CATEGORY = {
  electronics: ["amazon", "flipkart", "croma", "reliancedigital", "tatacliq"],
  fashion: ["amazon", "flipkart", "myntra", "ajio", "tatacliq", "nykaa"],
  beauty: ["amazon", "flipkart", "nykaa", "tatacliq"],
  grocery: ["bigbasket", "blinkit"],
  books: ["amazon", "flipkart"],
  kids: ["amazon", "flipkart", "firstcry"],
};

const products = [
  // ── Electronics (8) ──────────────────────────────────────────
  { name: "Apple MacBook Air M4 13 inch 16GB 256GB", brand: "Apple", category: "electronics", model: "MC6A4HN/A", ean: "1234567890123", attributes: { chip: "M4", storage: "256GB", ram: "16GB" } },
  { name: "Apple iPhone 16 128GB", brand: "Apple", category: "electronics", model: "A3287", ean: "1234567890124", attributes: { storage: "128GB", color: "black" } },
  { name: "Samsung Galaxy S24 Ultra 256GB", brand: "Samsung", category: "electronics", model: "SM-S928B", ean: "1234567890125", attributes: { storage: "256GB", ram: "12GB" } },
  { name: "Sony WH-1000XM5 Wireless Noise Cancelling Headphones", brand: "Sony", category: "electronics", model: "WH1000XM5", ean: "1234567890126", attributes: { type: "over-ear", anc: true } },
  { name: "LG 55 inch OLED Evo 4K Smart TV", brand: "LG", category: "electronics", model: "OLED55C4PSA", ean: "1234567890127", attributes: { size: "55inch", resolution: "4K" } },
  { name: "Samsung 55 inch Crystal 4K UHD Smart TV", brand: "Samsung", category: "electronics", model: "UA55CU7700", ean: "1234567890128", attributes: { size: "55inch", resolution: "4K" } },
  { name: "HP Pavilion 15 Intel Core i5 13th Gen Laptop", brand: "HP", category: "electronics", model: "15-eg3009TU", ean: "1234567890129", attributes: { chip: "i5", storage: "512GB" } },
  { name: "Dell Inspiron 14 AMD Ryzen 5 Laptop", brand: "Dell", category: "electronics", model: "D560792WIN9S", ean: "1234567890130", attributes: { chip: "ryzen5", storage: "512GB" } },

  // ── Fashion (8) ──────────────────────────────────────────────
  { name: "Nike Air Max 270 Men Running Shoes Black", brand: "Nike", category: "fashion", model: "AH8050-002", attributes: { color: "black", type: "running" } },
  { name: "Levi's 511 Slim Fit Jeans Men Blue", brand: "Levi's", category: "fashion", model: "04511-5102", attributes: { color: "blue", fit: "slim" } },
  { name: "Adidas Ultraboost Light Running Shoes White", brand: "Adidas", category: "fashion", model: "HQ6339", attributes: { color: "white", type: "running" } },
  { name: "H&M Floral Print Wrap Dress Women", brand: "H&M", category: "fashion", model: "HM-1072345", attributes: { color: "floral", type: "dress" } },
  { name: "Puma RS-X3 Sneakers Unisex White Blue", brand: "Puma", category: "fashion", model: "372884-01", attributes: { color: "white-blue" } },
  { name: "Allen Solly Men Slim Fit Formal Shirt Blue", brand: "Allen Solly", category: "fashion", model: "AMSF320G04282", attributes: { color: "blue", fit: "slim" } },
  { name: "W Women Straight Kurta Red", brand: "W", category: "fashion", model: "W-19AU57574-60412", attributes: { color: "red", type: "kurta" } },
  { name: "Biba Women Cotton Printed Anarkali Kurta", brand: "Biba", category: "fashion", model: "BIBA-COTTON-ANK", attributes: { material: "cotton", type: "anarkali" } },

  // ── Beauty (5) ───────────────────────────────────────────────
  { name: "Maybelline Fit Me Matte Foundation 230 Natural Buff", brand: "Maybelline", category: "beauty", model: "FIT-ME-230", attributes: { shade: "230", type: "matte" } },
  { name: "Minimalist 10% Niacinamide Face Serum 30ml", brand: "Minimalist", category: "beauty", model: "MIN-NIA-10-30", attributes: { ingredient: "niacinamide", volume: "30ml" } },
  { name: "Lakme 9to5 CC Cream Bronze 30g", brand: "Lakme", category: "beauty", model: "LAK-CC-BRONZE", attributes: { shade: "bronze", weight: "30g" } },
  { name: "Cetaphil Gentle Skin Cleanser 500ml", brand: "Cetaphil", category: "beauty", model: "CET-GSC-500", attributes: { type: "cleanser", volume: "500ml" } },
  { name: "Forest Essentials Soundarya Radiance Cream", brand: "Forest Essentials", category: "beauty", model: "FE-SOUND-RC", attributes: { type: "cream" } },

  // ── Grocery (5) ──────────────────────────────────────────────
  { name: "Tata Salt Iodised Salt 1kg", brand: "Tata", category: "grocery", model: "TATA-SALT-1KG", attributes: { weight: "1kg" } },
  { name: "Aashirvaad Superior MP Atta 5kg", brand: "Aashirvaad", category: "grocery", model: "AASH-ATTA-5KG", attributes: { weight: "5kg" } },
  { name: "Amul Butter 500g", brand: "Amul", category: "grocery", model: "AMUL-BUT-500G", attributes: { weight: "500g" } },
  { name: "Fortune Sunlite Refined Sunflower Oil 5L", brand: "Fortune", category: "grocery", model: "FORT-SUN-5L", attributes: { volume: "5L" } },
  { name: "Nestle Maggi 2 Minute Noodles Pack of 12", brand: "Nestle", category: "grocery", model: "MAGGI-2MIN-12", attributes: { quantity: "12" } },

  // ── Books (2) ────────────────────────────────────────────────
  { name: "Atomic Habits by James Clear", brand: "James Clear", category: "books", model: "AH-JCLEAR", isbn: "9780735211292", attributes: { author: "James Clear", format: "paperback" } },
  { name: "Rich Dad Poor Dad by Robert Kiyosaki", brand: "Robert Kiyosaki", category: "books", model: "RDPD-RK", isbn: "9781612680194", attributes: { author: "Robert Kiyosaki", format: "paperback" } },

  // ── Kids (2) ─────────────────────────────────────────────────
  { name: "Pampers All Round Protection Diapers Size 3 66 Count", brand: "Pampers", category: "kids", model: "PAMP-ARP-S3-66", attributes: { size: "3", count: "66" } },
  { name: "Fisher-Price Laugh & Learn Musical Toy", brand: "Fisher-Price", category: "kids", model: "FP-LAUGH-LEARN", attributes: { type: "musical" } },
];

const basePrices = {
  electronics: 55000,
  fashion: 4500,
  beauty: 800,
  grocery: 250,
  books: 400,
  kids: 1200,
};

function randomPrice(base) {
  const variance = base * 0.15;
  return Math.round(base + (Math.random() * variance * 2 - variance));
}

function getDomainForPlatform(platform) {
  const domainMap = {
    amazon: "amazon.in",
    flipkart: "flipkart.com",
    myntra: "myntra.com",
    ajio: "ajio.com",
    croma: "croma.com",
    nykaa: "nykaa.com",
    tatacliq: "tatacliq.com",
    reliancedigital: "reliancedigital.in",
    firstcry: "firstcry.com",
    blinkit: "blinkit.com",
    bigbasket: "bigbasket.com",
  };
  return domainMap[platform] || `${platform}.com`;
}

async function seed() {
  console.log("Seeding 30 products across Electronics, Fashion, Beauty, Grocery, Books, Kids...\n");

  for (const product of products) {
    // Insert product (idempotent via model_number)
    const existing = await query(
      "SELECT id FROM products WHERE model_number = $1",
      [product.model]
    );

    let productId;
    if (existing.rows.length > 0) {
      productId = existing.rows[0].id;
      console.log(`  ✓ Product exists: ${product.name}`);
    } else {
      const result = await query(
        `INSERT INTO products (canonical_name, brand, category, model_number, ean, isbn, attributes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          product.name,
          product.brand,
          product.category,
          product.model,
          product.ean || null,
          product.isbn || null,
          JSON.stringify(product.attributes || {}),
        ]
      );
      productId = result.rows[0].id;
      console.log(`  + Created: ${product.name} [${product.category}]`);
    }

    // Get category-appropriate platforms
    const categoryPlatforms = PLATFORMS_BY_CATEGORY[product.category] || ["amazon", "flipkart"];
    const basePrice = basePrices[product.category] || 10000;

    // Create 2-3 random platform listings per product
    const numListings = Math.floor(Math.random() * 2) + 2; // 2 or 3
    const shuffled = [...categoryPlatforms].sort(() => Math.random() - 0.5).slice(0, numListings);

    for (const platform of shuffled) {
      const price = randomPrice(basePrice);
      const domain = getDomainForPlatform(platform);
      const slug = product.model.toLowerCase().replace(/[^a-z0-9]/g, "-");
      const fakeUrl = `https://www.${domain}/product/${slug}`;

      const listingResult = await query(
        `INSERT INTO listings (product_id, platform, url, platform_pid, current_price, availability, match_confidence, match_method, last_scraped_at)
         VALUES ($1, $2, $3, $4, $5, 'in_stock', 1.00, 'deterministic', NOW())
         ON CONFLICT (url) DO NOTHING
         RETURNING id`,
        [productId, platform, fakeUrl, product.model, price]
      );

      if (listingResult.rows.length > 0) {
        const listingId = listingResult.rows[0].id;
        // Add 5 price history entries
        for (let i = 0; i < 5; i++) {
          const histPrice = randomPrice(basePrice);
          const daysAgo = i * 2;
          await query(
            `INSERT INTO price_history (listing_id, price, availability, source, scraped_at)
             VALUES ($1, $2, 'in_stock', 'scraper', NOW() - $3 * INTERVAL '1 day')`,
            [listingId, histPrice, daysAgo]
          );
        }
      }
    }
  }

  console.log("\n✅ Seeding complete: 30 products with category-aware listings and price history.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
