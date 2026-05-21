const tatacliqScraper = require("./src/scrapers/tatacliq.scraper");
const firstcryScraper = require("./src/scrapers/firstcry.scraper");

async function runTest(name, scraper, url) {
  console.log(`\n=================== TESTING ${name} ===================`);
  console.log(`URL: ${url}`);
  try {
    const result = await scraper.scrape(url);
    console.log("SUCCESS!");
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("FAILED:", err.stack || err.message);
  }
}

async function run() {
  await runTest("TataCliq (Search)", tatacliqScraper, "https://www.tatacliq.com/search/?searchCategory=all&text=Vero+Moda");
  await runTest("FirstCry (Search)", firstcryScraper, "https://www.firstcry.com/search?q=frock");
  console.log("\nTesting complete.");
}

run();
