const fs = require("fs");
const cheerio = require("cheerio");

const html = fs.readFileSync("amazon_search_dump.html", "utf-8");
const $ = cheerio.load(html);

console.log("Analyzing Amazon Search Dump HTML using cheerio...");

// Let's find any element containing "iPhone 16 Plus 128 GB"
let targetElement = null;

$("*").each((i, el) => {
  const children = $(el).children();
  if (children.length === 0) {
    const text = $(el).text().trim();
    if (text.includes("iPhone 16 Plus 128 GB")) {
      targetElement = el;
      console.log(`Found leaf element: <${el.tagName}> with text: "${text.substring(0, 55)}..."`);
      return false; // break loop
    }
  }
});

if (targetElement) {
  // Let's walk up the parent tree and print parent tags, classes, and attributes
  let parent = targetElement;
  let depth = 0;
  while (parent && depth < 10) {
    const attrs = parent.attribs || {};
    console.log(`Parent depth ${depth}: <${parent.tagName}> Class: "${attrs.class || ''}" Attributes:`, JSON.stringify(attrs));
    parent = parent.parent;
    depth++;
  }
} else {
  console.log("Could not find leaf element containing 'iPhone 16 Plus 128 GB'");
}
