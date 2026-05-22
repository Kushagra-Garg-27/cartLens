const db = require('./src/db');

async function runDiagnostics() {
  console.log("=== STEP 1: SCRAPE JOBS ===");
  const jobs = await db.query(`
    SELECT platform, status, listing_url, last_error, created_at, attempts 
    FROM scrape_jobs 
    ORDER BY created_at DESC 
    LIMIT 10;
  `);
  console.log(jobs.rows);

  console.log("\n=== STEP 2: LISTINGS ===");
  const listings = await db.query(`
    SELECT l.platform, l.url, l.current_price, l.availability, l.match_confidence, 
           l.last_scraped_at, p.canonical_name
    FROM listings l
    JOIN products p ON p.id = l.product_id
    ORDER BY l.last_scraped_at DESC
    LIMIT 10;
  `);
  console.log(listings.rows);
  
  console.log("\n=== STEP 4: MANUAL SCRAPE TRIGGER ===");
  const { processScrapeJobs } = require('./src/scrapers/scraper.runner');
  
  const p = await db.query('SELECT id, canonical_name FROM products LIMIT 1');
  if (p.rows.length === 0) {
      console.log('No products found in DB to test with.');
      process.exit(0);
  }
  console.log('Testing with product:', p.rows[0]);
  
  // Insert a test scrape job for flipkart
  await db.query(`
    INSERT INTO scrape_jobs (product_id, listing_url, platform, priority)
    VALUES ($1, $2, 'flipkart', 1)
  `, [p.rows[0].id, 'https://www.flipkart.com/search?q=APPLE+iPhone+16']);
  
  console.log('Job inserted, running scraper...');
  await processScrapeJobs();
  
  const testJobs = await db.query(`
    SELECT status, last_error FROM scrape_jobs 
    WHERE product_id = $1 ORDER BY created_at DESC LIMIT 5
  `, [p.rows[0].id]);
  console.log('Job result:', testJobs.rows);
  
  const testListings = await db.query(`
    SELECT platform, url, current_price FROM listings 
    WHERE product_id = $1
  `, [p.rows[0].id]);
  console.log('Listings in DB:', testListings.rows);

  process.exit(0);
}

runDiagnostics().catch(console.error);
