const db = require("../src/db");
const { normalizeProductUrl } = require("../src/utils/url.normalizer");

async function run() {
  console.log("Starting database URL normalization and deduplication...");
  try {
    const { rows: listings } = await db.query(
      "SELECT id, url, platform, product_id FROM listings"
    );

    console.log(`Processing ${listings.length} listings...`);
    let updatedCount = 0;
    let mergedCount = 0;

    for (const listing of listings) {
      const normalizedUrl = normalizeProductUrl(listing.url, listing.platform);
      
      if (normalizedUrl !== listing.url) {
        // Check if a listing with the normalized URL already exists
        const { rows: existing } = await db.query(
          "SELECT id, product_id FROM listings WHERE url = $1",
          [normalizedUrl]
        );

        if (existing.length > 0) {
          const keptListing = existing[0];
          console.log(`Merging duplicate listing:\n  From: ${listing.url}\n  To:   ${normalizedUrl}`);
          
          // Re-associate price history to the kept listing
          await db.query(
            "UPDATE price_history SET listing_id = $1 WHERE listing_id = $2",
            [keptListing.id, listing.id]
          );

          // Update product_id of kept listing if it is null
          if (!keptListing.product_id && listing.product_id) {
            await db.query(
              "UPDATE listings SET product_id = $1 WHERE id = $2",
              [listing.product_id, keptListing.id]
            );
          }

          // Delete the duplicate listing
          await db.query(
            "DELETE FROM listings WHERE id = $1",
            [listing.id]
          );
          mergedCount++;
        } else {
          // No duplicate exists, simply update the URL
          console.log(`Normalizing URL:\n  Old: ${listing.url}\n  New: ${normalizedUrl}`);
          await db.query(
            "UPDATE listings SET url = $1 WHERE id = $2",
            [normalizedUrl, listing.id]
          );
          updatedCount++;
        }
      }
    }

    console.log(`Deduplication finished successfully!`);
    console.log(`- Normalized URLs: ${updatedCount}`);
    console.log(`- Merged duplicate listings: ${mergedCount}`);
  } catch (err) {
    console.error("Deduplication error:", err);
  } finally {
    process.exit();
  }
}

run();
