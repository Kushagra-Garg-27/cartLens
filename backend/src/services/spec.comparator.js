const db = require("../db");

/**
 * Compare specs across platform listings for a product.
 * Returns a list of comparison rows.
 *
 * @param {string} productId
 * @param {Array} listings
 * @returns {Promise<Array>} List of spec rows, e.g. [{ label: "RAM", values: { amazon: "8GB", flipkart: "8GB" } }]
 */
async function compareSpecs(productId, listings) {
  const result = await db.query(
    "SELECT canonical_name, brand, model_number, category, ai_product_type, raw_gender, ai_attributes FROM products WHERE id = $1",
    [productId]
  );
  if (result.rows.length === 0) return [];
  const product = result.rows[0];

  // Initialize spec rows with product-level canonical specs
  const specRows = [];

  // Always include Brand, Model Number, and Category
  if (product.brand) {
    specRows.push({
      label: "Brand",
      canonical: product.brand,
      values: {}
    });
  }
  if (product.model_number) {
    specRows.push({
      label: "Model Number",
      canonical: product.model_number,
      values: {}
    });
  }
  if (product.category) {
    specRows.push({
      label: "Category",
      canonical: product.category.toUpperCase(),
      values: {}
    });
  }

  // Handle AI Attributes
  const aiAttr = product.ai_attributes || {};
  
  // Extract RAM/Storage/Color if they exist in AI attributes
  const specKeys = Object.keys(aiAttr);
  for (const key of specKeys) {
    // Skip internal/empty values
    if (!aiAttr[key]) continue;
    const label = key.toUpperCase();
    // Prevent duplicate entries for Brand/Model if they are in ai_attributes
    if (label === "BRAND" || label === "MODEL") continue;

    specRows.push({
      label,
      canonical: String(aiAttr[key]),
      values: {}
    });
  }

  // Populate listing-specific values
  for (const listing of listings) {
    const platform = listing.platform;
    const scrapedTitle = listing.scraped_title || listing.title || "";

    for (const spec of specRows) {
      const label = spec.label.toLowerCase();
      let extractedValue = null;

      if (label === "brand") {
        extractedValue = product.brand;
      } else if (label === "model number") {
        extractedValue = product.model_number;
      } else if (label === "category") {
        extractedValue = product.category ? product.category.toUpperCase() : null;
      } else if (label === "ram") {
        // Try to extract RAM from scraped title, fall back to canonical
        const ramMatch = scrapedTitle.match(/\b(\d+)\s*(?:gb|mb)\s*ram\b/i) || 
                         scrapedTitle.match(/\b(\d+)\s*gb\b/i);
        extractedValue = ramMatch ? `${ramMatch[1]}GB` : (aiAttr.ram || null);
      } else if (label === "storage") {
        const storageMatch = scrapedTitle.match(/\b(\d+)\s*(?:gb|tb|rom)\b/i);
        extractedValue = storageMatch ? storageMatch[0].toUpperCase() : (aiAttr.storage || null);
      } else if (label === "color") {
        const commonColors = ["black", "white", "blue", "red", "green", "gold", "silver", "grey", "gray", "yellow", "pink", "purple"];
        const foundColor = commonColors.find(color => scrapedTitle.toLowerCase().includes(color));
        extractedValue = foundColor ? foundColor.charAt(0).toUpperCase() + foundColor.slice(1) : (aiAttr.color || null);
      } else {
        // Fallback to canonical AI attribute if defined
        extractedValue = aiAttr[label] || null;
      }

      if (extractedValue) {
        spec.values[platform] = extractedValue;
      }
    }
  }

  return specRows;
}

module.exports = { compareSpecs };
