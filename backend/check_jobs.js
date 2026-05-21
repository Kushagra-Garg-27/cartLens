const db = require('./src/db');

async function checkJobs() {
  // Check scrape jobs for OnePlus 15
  const jobs = await db.query(`
    SELECT sj.platform, sj.status, sj.last_error, sj.attempts
    FROM scrape_jobs sj
    JOIN products p ON p.id = sj.product_id
    WHERE p.canonical_name LIKE '%OnePlus 15%'
    ORDER BY sj.created_at DESC
  `);
  console.log('OnePlus 15 scrape jobs:');
  for (const j of jobs.rows) {
    console.log('  ' + j.platform + ': ' + j.status + (j.last_error ? ' (' + j.last_error.substring(0, 60) + ')' : ''));
  }

  // Check all listings
  const listings = await db.query(`
    SELECT l.platform, l.current_price, l.product_id, l.url
    FROM listings l
    WHERE l.product_id IS NOT NULL
    ORDER BY l.current_price ASC
  `);
  console.log('\nAll linked listings:');
  for (const l of listings.rows) {
    console.log('  ' + l.platform + ': Rs.' + l.current_price + ' - ' + l.url.substring(0, 80));
  }

  process.exit(0);
}

checkJobs().catch(e => { console.error(e.message); process.exit(1); });
