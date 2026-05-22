const axios = require("axios");

async function run() {
  try {
    const url = "https://api.croma.com/product/allchannels/v1/search?currentPage=0&query=APPLE%20iPhone%2016:relevance&fields=FULL";
    console.log("Fetching Croma API directly...");
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://www.croma.com",
        "Referer": "https://www.croma.com/"
      }
    });
    console.log("SUCCESS!");
    console.log("Status:", response.status);
    console.log("Data keys:", Object.keys(response.data));
    if (response.data.products) {
      console.log(`Found ${response.data.products.length} products!`);
      console.log("First product sample:", JSON.stringify(response.data.products[0], null, 2));
    }
  } catch (err) {
    console.error("FAILED:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response headers:", err.response.headers);
      console.error("Response body:", JSON.stringify(err.response.data).substring(0, 500));
    }
  }
}

run();
