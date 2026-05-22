const fs = require("fs");
const cheerio = require("cheerio");

const html = fs.readFileSync("amazon_search_dump.html", "utf-8");
const $ = cheerio.load(html);

const items = $("div[data-component-type='s-search-result'], div.s-card-container, div[data-cy='asin-faceout-container']");
console.log(`Found ${items.length} items`);

const results = [];
items.each((i, el) => {
  const item = $(el);
  
  // Find link element. It can be h2 a, or a.a-link-normal that has an href containing /dp/ or /gp/ or sspa/click
  let linkEl = item.find("h2 a");
  if (!linkEl.length) {
    linkEl = item.find("a.a-link-normal").filter((_, a) => {
      const href = $(a).attr("href") || "";
      return href.includes("/dp/") || href.includes("/gp/") || href.includes("/sspa/click");
    });
  }
  
  if (linkEl.length) {
    const href = linkEl.first().attr("href") || "";
    // The title can be inside an h2 tag that is inside or contains the link, or the link text itself
    let titleText = "";
    const h2 = linkEl.first().find("h2");
    if (h2.length) {
      titleText = h2.text().trim();
    } else {
      // Try to find any h2 inside the item first, but make sure it isn't the brand "Apple"/etc if there's a better one
      const h2s = item.find("h2");
      h2s.each((_, h) => {
        const text = $(h).text().trim();
        if (text && text.length > titleText.length) {
          titleText = text;
        }
      });
    }
    
    if (!titleText) {
      titleText = linkEl.first().text().trim();
    }
    
    // Clean up titleText from extra spaces
    titleText = titleText.replace(/\s+/g, ' ').trim();
    
    if (href && titleText && !results.some(r => r.url === href)) {
      results.push({ url: href, title: titleText });
      console.log(`Candidate ${results.length}: title="${titleText}" href="${href.substring(0, 80)}..."`);
    }
  }
});
