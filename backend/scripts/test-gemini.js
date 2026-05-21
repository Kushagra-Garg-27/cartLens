const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY);

async function test(modelName) {
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent("Hello");
    console.log(`[SUCCESS] ${modelName}:`, result.response.text());
  } catch(e) {
    console.log(`[FAILED] ${modelName}:`, e.message);
  }
}

async function run() {
  await test("gemini-1.5-flash-latest");
  await test("gemini-1.5-flash");
  await test("gemini-pro");
  await test("gemini-1.5-pro");
}

run();
