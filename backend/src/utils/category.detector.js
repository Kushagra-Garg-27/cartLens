/**
 * SmartCompare Pro — Category Detector
 *
 * Detects product category from URL, title, and brand text.
 * Used for platform routing — ensures only relevant platforms get scrape jobs.
 */

const CATEGORY_PATTERNS = [
  {
    category: "fashion",
    pattern: /\b(?:myntra|ajio|fashion|dresses?|shirts?|shoes?|kurtas?|sarees?|jeans|tshirts?|t-shirt|lehengas?|sneakers?|sandals?|heels?|jackets?|blazers?|trousers?|chinos?|hoodies?|joggers?|palazzos?|dupattas?|skirts?|kurtis?|ethnic|footwear|clothing|apparel|suits?|socks?|activewear|boots?)\b/i
  },
  {
    category: "beauty",
    pattern: /\b(?:nykaa|beauty|skincare|lipsticks?|foundations?|serums?|moisturizers?|mascaras?|eyeshadows?|concealers?|sunscreens?|cleansers?|toners?|shampoos?|conditioners?|perfumes?|fragrances?|deodorants?|lotions?|makeup|lip\s+balm|facewash|face\s+wash|body\s+wash|soaps?)\b|hair\s+(?:oil|cream|gel|wax|color|dye|spray)|\bcream\b(?!\s+(?:cheese|butter|cracker|biscuit|roll|wafer|bun|cake|pie|donut|cookie|pudding|soup))/i
  },
  {
    category: "grocery",
    pattern: /\b(?:blinkit|bigbasket|grocery|groceries|milks?|rice|dal|atta|sugar|oils?|ghee|salts?|spices?|masalas?|flours?|teas?|coffees?|biscuits?|snacks?|juices?|waters?|breads?|butters?|cheeses?|paneer|curds?|yogurts?|eggs?|noodles?|pastas?|veggies?|vegetables?|fruits?|pulses?|grains?|cereal|atta|chocolates?)\b/i
  },
  {
    category: "electronics",
    pattern: /\b(?:laptops?|notebooks?|phones?|mobiles?|tvs?|televisions?|refrigerators?|fridges?|washing\s+machines?|croma|reliance\s+digital|headphones?|earphones?|earbuds?|airpods?|speakers?|cameras?|tablets?|smartwatch(?:es)?|chargers?|power\s+banks?|routers?|monitors?|printers?|air\s+conditioners?|ac|microwaves?|mixers?|grinders?|irons?|fans?|coolers?|vacuums?|hair\s+dryer|hair\s+straightener|appliances?)\b/i
  },
  {
    category: "books",
    pattern: /\b(?:books?|isbn|novels?|paperbacks?|hardcovers?|authors?|editions?|publishers?|bestsellers?|literature|biography|fiction|nonfiction)\b/i
  },
  {
    category: "kids",
    pattern: /\b(?:kids?|baby|babies|firstcry|toddlers?|infants?|diapers?|pampers|toys?|strollers?|cradles?|nursery|newborns?|child|children|maternity)\b/i
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
