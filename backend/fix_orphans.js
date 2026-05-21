const db = require('./src/db');

async function fixOrphans() {
  // Link listings that were scraped but not linked to products
  const result = await db.query(`
    UPDATE listings l
    SET product_id = sj.product_id
    FROM scrape_jobs sj
    WHERE l.url = sj.listing_url
      AND l.product_id IS NULL
      AND sj.product_id IS NOT NULL
      AND sj.status = 'done'
  `);
  console.log('Fixed ' + result.rowCount + ' orphaned listings');
  
  // Also check how many listings exist per product
  const stats = await db.query(`
    SELECT p.canonical_name, COUNT(l.id) as listing_count
    FROM products p
    LEFT JOIN listings l ON l.product_id = p.id
    GROUP BY p.id, p.canonical_name
    ORDER BY listing_count DESC
    LIMIT 10
  `);
  console.log('\nProduct listing counts:');
  for (const row of stats.rows) {
    console.log('  ' + row.canonical_name + ': ' + row.listing_count + ' listings');
  }
  
  process.exit(0);
}

fixOrphans().catch(e => { console.error(e.message); process.exit(1); });
