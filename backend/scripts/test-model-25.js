const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY);

async function test(modelName) {
  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: "application/json" }
    });
    const result = await model.generateContent("Respond with a JSON object: {\"success\": true}");
    console.log(`[SUCCESS] ${modelName}:`, result.response.text());
  } catch(e) {
    console.log(`[FAILED] ${modelName}:`, e.message);
  }
}

async function run() {
  await test("gemini-2.0-flash-lite");
  await test("gemini-2.5-flash-lite");
  await test("gemini-2.0-flash");
}

run();
