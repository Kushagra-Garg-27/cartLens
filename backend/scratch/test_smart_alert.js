const db = require("../src/db");
const alertService = require("../src/services/alert.service");
const logger = require("../src/utils/logger");

async function runTest() {
  console.log("=== CartLens AI Smart Alert Diagnostic Tool ===");

  try {
    // 1. Check database connection
    console.log("\nChecking database connectivity...");
    const dbCheck = await db.query("SELECT NOW()");
    console.log(`Database connected successfully at: ${dbCheck.rows[0].now}`);

    // 2. Fetch a valid product from the database
    console.log("\nFetching an active product from DB...");
    const productRes = await db.query("SELECT id, canonical_name FROM products LIMIT 1");
    if (productRes.rows.length === 0) {
      console.log("No products found in DB. Please make sure the DB is seeded.");
      return;
    }
    const product = productRes.rows[0];
    console.log(`Found product: ${product.canonical_name} (${product.id})`);

    // 3. Check listings for the product
    console.log("\nChecking listings for this product...");
    const listingsRes = await db.query(
      "SELECT platform, current_price, url FROM listings WHERE product_id = $1 AND current_price IS NOT NULL ORDER BY current_price ASC",
      [product.id]
    );
    console.log(`Found ${listingsRes.rows.length} listings:`);
    listingsRes.rows.forEach(l => {
      console.log(` - ${l.platform}: ₹${l.current_price} (${l.url})`);
    });

    if (listingsRes.rows.length === 0) {
      console.log("No active listings found for this product. Cannot run the full alert check.");
      return;
    }

    const lowestListing = listingsRes.rows[0];
    const lowestPrice = parseFloat(lowestListing.current_price);
    const targetPrice = lowestPrice + 1000; // Trigger criteria: target >= lowest current price

    console.log(`\nSimulating watchlist addition:`);
    console.log(` - User Target Price: ₹${targetPrice}`);
    console.log(` - Lowest Current Price: ₹${lowestPrice} on ${lowestListing.platform}`);
    console.log(` - Criteria met? targetPrice >= lowestPrice is: ${targetPrice >= lowestPrice}`);

    // 4. Test sendAISmartAlert
    console.log("\nTriggering sendAISmartAlert (sending test email to kushagragarg2272@gmail.com)...");
    await alertService.sendAISmartAlert({
      userEmail: "kushagragarg2272@gmail.com",
      productId: product.id,
      productName: product.canonical_name,
      platform: lowestListing.platform,
      oldPrice: lowestPrice + 500, // Show a 500 price drop
      newPrice: lowestPrice,
      targetPrice: targetPrice,
      buyUrl: lowestListing.url
    });

    console.log("\n=== Diagnostic Complete successfully ===");
    process.exit(0);
  } catch (err) {
    console.error("\n*** ERROR DURING DIAGNOSTIC ***");
    console.error(err);
    process.exit(1);
  }
}

runTest();
