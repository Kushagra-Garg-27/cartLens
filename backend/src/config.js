/**
 * CHANGES:
 * - Added gemini.apiKey reading GEMINI_API_KEY from env (optional)
 */
const dotenv = require("dotenv");
dotenv.config();

const required = [
  "DATABASE_URL",
  "JWT_SECRET",
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const config = Object.freeze({
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },
  email: {
    apiKey: process.env.RESEND_API_KEY || "",
    fromEmail: process.env.RESEND_FROM_EMAIL || "noreply@smartcompare.pro",
  },
  app: {
    nodeEnv: process.env.NODE_ENV || "development",
    port: parseInt(process.env.PORT, 10) || 3000,
    backendUrl: process.env.BACKEND_URL || "http://localhost:3000",
  },
  scraper: {
    minDelayMs: parseInt(process.env.SCRAPER_MIN_DELAY_MS, 10) || 8000,
    maxDelayMs: parseInt(process.env.SCRAPER_MAX_DELAY_MS, 10) || 15000,
    userAgentPool: (() => {
      try {
        return JSON.parse(process.env.USER_AGENT_POOL || "[]");
      } catch {
        return [
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ];
      }
    })(),
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "",
  },
  rateLimit: {
    compare: parseInt(process.env.RATE_LIMIT_COMPARE, 10) || 30,
    auth: parseInt(process.env.RATE_LIMIT_AUTH, 10) || 10,
  },
});

module.exports = config;
