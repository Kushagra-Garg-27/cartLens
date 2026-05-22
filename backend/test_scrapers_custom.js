const amazonScraper = require("./src/scrapers/amazon.scraper");
const flipkartScraper = require("./src/scrapers/flipkart.scraper");
const cromaScraper = require("./src/scrapers/croma.scraper");
const reliancedigitalScraper = require("./src/scrapers/reliancedigital.scraper");
const vijaysalesScraper = require("./src/scrapers/vijaysales.scraper");
const appleindiaScraper = require("./src/scrapers/appleindia.scraper");

async function runTest(name, scraper, url) {
  console.log(`\n=================== TESTING ${name} ===================`);
  console.log(`URL: ${url}`);
  try {
    const result = await scraper.scrape(url);
    console.log("SUCCESS!");
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("FAILED:", err.message);
    if (err.stack) {
      console.error(err.stack);
    }
  }
}

async function run() {
  // Test with APPLE iPhone 16
  await runTest("Amazon", amazonScraper, "https://www.amazon.in/s?k=APPLE+iPhone+16");
  await runTest("Flipkart", flipkartScraper, "https://www.flipkart.com/search?q=APPLE+iPhone+16");
  await runTest("Croma", cromaScraper, "https://www.croma.com/search/?text=APPLE+iPhone+16");
  await runTest("Reliance Digital", reliancedigitalScraper, "https://www.reliancedigital.in/search?q=APPLE+iPhone+16");
  await runTest("Vijay Sales", vijaysalesScraper, "https://www.vijaysales.com/search/APPLE+iPhone+16");
  await runTest("Apple India", appleindiaScraper, "https://www.apple.com/in/shop/buy-iphone?fh=iphone-16");

  console.log("\nTesting complete.");
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
