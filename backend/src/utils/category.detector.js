/**
 * SmartCompare Pro — Category Detector
 *
 * Detects product category from URL, title, and brand text.
 * Used for platform routing — ensures only relevant platforms get scrape jobs.
 */

const CATEGORY_PATTERNS = [
  {
    category: "fashion",
    pattern: /myntra|ajio|fashion|dress|shirt|shoes|kurta|saree|jeans|tshirt|t-shirt|lehenga|sneaker|sandal|heel|jacket|blazer|trouser|chino|hoodie|jogger|palazzo|dupatta|skirt|kurti|ethnic|footwear|clothing/i
  },
  {
    category: "beauty",
    pattern: /nykaa|beauty|skincare|lipstick|foundation|serum|moisturizer|mascara|eyeshadow|concealer|sunscreen|cleanser|toner|shampoo|conditioner|perfume|fragrance|deodorant|cream|lotion|makeup/i
  },
  {
    category: "grocery",
    pattern: /blinkit|zepto|bigbasket|jiomart|grocery|milk|rice|dal|atta|sugar|oil|ghee|salt|spice|masala|flour|tea|coffee|biscuit|snack|juice|water|bread|butter|cheese|paneer|curd|yogurt|egg|noodle|pasta/i
  },
  {
    category: "electronics",
    pattern: /laptop|phone|mobile|tv|television|refrigerator|washing machine|croma|reliance.*digital|headphone|earphone|earbuds|speaker|camera|tablet|smartwatch|charger|power bank|router|monitor|printer|air conditioner|microwave|mixer|grinder|iron|fan|cooler|vacuum/i
  },
  {
    category: "books",
    pattern: /book|isbn|novel|paperback|hardcover|author|edition|publisher|bestseller/i
  },
  {
    category: "kids",
    pattern: /kids|baby|firstcry|toddler|infant|diaper|pampers|toy|stroller|cradle|nursery|newborn|child/i
  }
];

/**
 * Detect product category from payload data.
 * @param {{ url?: string, title?: string, brand?: string }} payload
 * @returns {string} One of: fashion, beauty, grocery, electronics, books, kids
 */
function detectCategory(payload) {
  const { url, title, brand } = payload || {};
  const text = [url || "", title || "", brand || ""].join(" ").toLowerCase();

  for (const { category, pattern } of CATEGORY_PATTERNS) {
    if (pattern.test(text)) {
      return category;
    }
  }

  // Default to electronics if no pattern matches
  return "electronics";
}

module.exports = { detectCategory };
