const db = require('./src/db');
const { processScrapeJobs } = require('./src/scrapers/scraper.runner');

async function test() {
  const p = await db.query('SELECT id, canonical_name FROM products LIMIT 1');
  console.log('Testing with product:', p.rows[0]);
  
  await db.query(`
    INSERT INTO scrape_jobs (product_id, listing_url, platform, priority)
    VALUES ($1, $2, 'amazon', 1)
  `, [p.rows[0].id, 'https://www.amazon.in/s?k=macbook+air+m4']);
  
  console.log('Job inserted, running scraper...');
  await processScrapeJobs();
  
  const jobs = await db.query(`
    SELECT status, last_error FROM scrape_jobs 
    WHERE product_id = $1 ORDER BY created_at DESC LIMIT 5
  `, [p.rows[0].id]);
  console.log('Job result:', jobs.rows);
  
  const listings = await db.query(`
    SELECT platform, url, current_price FROM listings 
    WHERE product_id = $1
  `, [p.rows[0].id]);
  console.log('Listings in DB:', listings.rows);
  
  process.exit(0);
}
test().catch(console.error);
