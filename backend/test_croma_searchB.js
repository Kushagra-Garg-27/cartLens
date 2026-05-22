const axios = require("axios");
const cheerio = require("cheerio");

async function run() {
  try {
    const url = "https://www.croma.com/searchB?q=APPLE%20iPhone%2016%3Arelevance&text=APPLE%20iPhone%2016";
    console.log("Fetching Croma searchB URL directly...");
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "max-age=0"
      }
    });
    console.log("SUCCESS!");
    console.log("Status:", response.status);
    
    const $ = cheerio.load(response.data);
    console.log("HTML Title:", $("title").text());
    
    // Check for products
    const products = [];
    $("div.product-item, li.product-item, div.product-card, [class*='product-item']").each((i, el) => {
      const title = $(el).find("h3, a[class*='product'], [class*='title']").text().trim();
      const link = $(el).find("a").first().attr("href");
      if (title && link) {
        products.push({ title, link });
      }
    });
    
    console.log(`Found ${products.length} products on searchB!`);
    if (products.length > 0) {
      console.log("Sample product:", products[0]);
    }
  } catch (err) {
    console.error("FAILED:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
    }
  }
}

run();
