const fs = require("fs");
const cheerio = require("cheerio");

if (!fs.existsSync("croma_search_dump.html")) {
  console.log("croma_search_dump.html does not exist!");
  process.exit(1);
}

const html = fs.readFileSync("croma_search_dump.html", "utf-8");
const $ = cheerio.load(html);

console.log("Analyzing croma_search_dump.html...");
console.log("Page title:", $("title").text());

// Let's count some elements
console.log("Total links:", $("a").length);
console.log("Total h3 elements:", $("h3").length);
console.log("Total img elements:", $("img").length);

// Let's search for keywords like "iPhone" or "APPLE"
let foundWord = false;
$("*").each((i, el) => {
  const text = $(el).text().trim();
  if (text.includes("iPhone") || text.includes("APPLE")) {
    console.log(`Found text: "${text.substring(0, 100)}" in tag <${el.tagName}> with class "${$(el).attr("class") || ""}"`);
    foundWord = true;
    return false; // break
  }
});

if (!foundWord) {
  console.log("No mention of 'iPhone' or 'APPLE' found in the HTML!");
}
