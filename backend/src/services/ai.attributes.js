/**
 * SmartCompare Pro — AI Attribute Extractor
 * Uses Gemini to parse a raw product title into structured attributes.
 * This is used for strict matching to prevent false positives across variants and unrelated categories.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("../config");
const logger = require("../utils/logger");

let _genAI = null;
function getGenAI() {
  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  }
  return _genAI;
}

/**
 * Extracts normalized attributes from a raw product title.
 * @param {string} rawTitle 
 * @returns {Promise<{ product_type: string, brand: string, model: string, attributes: Record<string, string>, raw_gender: string }>}
 */
async function extractAttributes(rawTitle) {
  if (!rawTitle) return null;

  const prompt = `You are an e-commerce product attribute extractor. 
Analyze the following product title: "${rawTitle}"

Extract the following structure:
- product_type: A highly normalized, generic category for the item (e.g., "smartphone", "t-shirt", "laptop", "bag", "shoes", "refrigerator"). Do not use compound types, keep it to one or two words.
- brand: The brand name, normalized (lowercase, remove inc/ltd).
- model: The core model name or series (e.g., "iphone 15", "galaxy s24", "polo collar", "air force 1").
- raw_gender: If applicable (e.g., for clothing/shoes), specify "men", "women", "unisex", "kids". Otherwise null.
- attributes: A key-value object of important variants. 
  - For phones: {"ram": "12GB", "storage": "512GB", "color": "blue"}
  - For clothes: {"color": "black", "size": "M"}

Respond ONLY with a JSON object. No markdown, no preamble.`;

  try {
    const model = getGenAI().getGenerativeModel({ 
      model: "gemini-2.5-flash-lite",
      generationConfig: { responseMimeType: "application/json" }
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text()?.trim() || "{}";
    
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    logger.info({ service: "ai_attributes", event: "extraction_success", title: rawTitle.substring(0, 40) });
    return parsed;
  } catch (err) {
    logger.error({ service: "ai_attributes", event: "extraction_error", error: err.message, title: rawTitle.substring(0, 40) });
    return null;
  }
}

module.exports = { extractAttributes };
