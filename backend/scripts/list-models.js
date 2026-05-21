// native fetch in node 20

async function listModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.VITE_GEMINI_API_KEY}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.models) {
    console.log("Models:");
    json.models.filter(m => m.supportedGenerationMethods.includes("generateContent")).forEach(m => console.log(m.name));
  } else {
    console.log("Error:", json);
  }
}

listModels();
