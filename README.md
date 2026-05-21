<h1 align="center">🛒 SmartCompare Pro</h1>
<p align="center">Real-time price comparison across Indian e-commerce</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-3.0.0-blue" alt="Version" />
  <img src="https://img.shields.io/badge/platform-Chrome%20Extension-yellow?logo=googlechrome" alt="Platform" />
  <img src="https://img.shields.io/badge/backend-Node.js-brightgreen?logo=nodedotjs" alt="Backend" />
  <img src="https://img.shields.io/badge/database-PostgreSQL-blue?logo=postgresql" alt="Database" />
  <img src="https://img.shields.io/badge/AI-Gemini%202.5%20Flash-orange?logo=google" alt="AI" />
  <img src="https://img.shields.io/badge/docker-ready-2496ED?logo=docker" alt="Docker" />
  <img src="https://img.shields.io/badge/status-active-success" alt="Status" />
</p>

SmartCompare Pro is a powerful Chrome extension that automatically tracks and compares product prices across 15 Indian e-commerce platforms. It helps you find the best deals, monitors price history, and alerts you to price drops while you shop naturally. It also features automatic coupon parsing, bank offer badges, cross-platform specifications comparison, and variant mismatch protection.

## Table of Contents
[✨ Features](#-features) | [🏗️ Architecture](#️-architecture) | [🛠️ Tech Stack](#️-tech-stack) | [📦 Installation](#-installation) | [🔧 Configuration](#-configuration) | [🚀 Usage](#-usage) | [🌐 Supported Platforms](#-supported-platforms) | [🧠 How It Works](#-how-it-works)

## ✨ Features

<table>
  <tr>
    <td>🔍 Real-time price comparison across 15 platforms</td>
    <td>🏆 Personalized platform ranking (learns your preferences)</td>
  </tr>
  <tr>
    <td>📈 Price history tracking with interactive charts</td>
    <td>🔗 Cross-platform product matching (ASIN, model number, Jaccard)</td>
  </tr>
  <tr>
    <td>🧠 AI-powered product recommendations (Gemini 2.5 Flash)</td>
    <td>👁️ Passive price observation on every product page visit</td>
  </tr>
  <tr>
    <td>🔔 Smart price drop alerts via email</td>
    <td>⚡ Sub-150ms response for cached products</td>
  </tr>
  <tr>
    <td>🏷️ Coupon & Bank Offer badges with effective pricing</td>
    <td>📋 Specifications grid with cross-platform comparison</td>
  </tr>
  <tr>
    <td>⚠️ Variant mismatch alert flags across stores</td>
    <td>🐳 Docker-ready — single command local setup</td>
  </tr>
</table>

## 🏗️ Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                  Chrome Extension (MV3)                  │
│  content.js │ background.js │ popup.js │ content.css     │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API (JWT Auth)
┌──────────────────────▼──────────────────────────────────┐
│              Node.js + Express Backend                   │
│   Routes │ Scrapers │ Services │ Cron Jobs │ Ranker      │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│         PostgreSQL (Neon.tech) + Render.com              │
│   products │ listings │ price_history │ watchlist        │
│   scrape_jobs │ user_platform_affinity                   │
└─────────────────────────────────────────────────────────┘
```

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Extension | Vanilla JS, Manifest V3 | DOM extraction, panel rendering |
| Backend | Node.js, Express | API, scraping orchestration |
| Database | PostgreSQL 15 (Neon.tech) | Products, prices, history |
| Scraping | Playwright + Cheerio | Anti-bot resistant scraping |
| AI | Gemini 2.5 Flash | Product recommendations |
| Email | Resend.com | Price drop alert emails |
| Deployment | Render.com | Backend hosting |
| Auth | JWT | User identification |

## 📦 Installation

### 🐳 Docker Setup (Recommended)

The fastest way to get the backend running locally — no manual database setup needed.

```bash
git clone https://github.com/Kushagra-Garg-27/cartLens.git
cd cartLens/backend
cp .env.example .env
# Fill in your .env values
docker-compose up --build
```

The backend will be available at `http://localhost:3000`.

To stop:
```bash
docker-compose down
```

To stop and wipe the database volume:
```bash
docker-compose down -v
```

### 🖥️ Manual Setup (Without Docker)

```bash
git clone https://github.com/Kushagra-Garg-27/cartLens.git
cd cartLens/backend
npm install
cp .env.example .env
# Fill in your .env values — DATABASE_URL must point to a running PostgreSQL instance
npm run dev
```

### 🧩 Extension Setup

1. Open Chrome → `chrome://extensions`
2. Enable **Developer Mode** (top right toggle)
3. Click **"Load unpacked"**
4. Select the `cartLens/extension/` folder
5. Pin the SmartCompare Pro extension from the toolbar

> **Note:** Make sure the backend is running before using the extension. By default the extension points to `http://localhost:3000`.

## 🔧 Configuration

Copy `.env.example` to `.env` and fill in the values:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ Required | PostgreSQL connection string (auto-set in Docker) |
| `JWT_SECRET` | ✅ Required | Secret key, min 32 characters |
| `VITE_GEMINI_API_KEY` | ✅ Required | Gemini API key for AI recommendations — [Google AI Studio](https://aistudio.google.com/) |
| `JWT_EXPIRES_IN` | ⚙️ Optional | Token expiry e.g. `7d` |
| `RESEND_API_KEY` | ⚙️ Optional | For price drop email alerts |
| `RESEND_FROM_EMAIL` | ⚙️ Optional | Sender address for alert emails |
| `PORT` | ⚙️ Optional | Default: `3000` |
| `NODE_ENV` | ⚙️ Optional | `development` or `production` |
| `BACKEND_URL` | ⚙️ Optional | Backend deployment URL (Render.com) |
| `PLAYWRIGHT_BROWSERS_PATH` | ⚙️ Optional | Custom path to Playwright browsers |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | ⚙️ Optional | Skip browser download on install |
| `SCRAPER_MIN_DELAY_MS` | ⚙️ Optional | Scraper minimum delay in ms |
| `SCRAPER_MAX_DELAY_MS` | ⚙️ Optional | Scraper maximum delay in ms |
| `USER_AGENT_POOL` | ⚙️ Optional | JSON array of user agent strings |
| `RATE_LIMIT_COMPARE` | ⚙️ Optional | Rate limit for `/api/compare` route |
| `RATE_LIMIT_AUTH` | ⚙️ Optional | Rate limit for `/api/auth` route |

## 🚀 Usage

1. 🌐 Visit any supported product page (Amazon, Flipkart, Croma, etc.)
2. ⚡ SmartCompare Pro automatically detects the product and fetches prices
3. 📊 Click the panel to see all platform prices side by side
4. 📈 Switch to the **History** tab to see price trends over time
5. 🔔 Set a target price alert — get emailed when the price drops
6. 🧠 Check the **AI Recommendations** tab for better alternatives

## 🌐 Supported Platforms

<table>
  <tr>
    <td>🛒 Amazon.in</td>
    <td>🛍️ Flipkart</td>
    <td>📱 Reliance Digital</td>
  </tr>
  <tr>
    <td>🟢 Croma</td>
    <td>🔴 Vijay Sales</td>
    <td>👗 Myntra</td>
  </tr>
  <tr>
    <td>👟 Ajio</td>
    <td>💄 Nykaa</td>
    <td>💜 TataCliq</td>
  </tr>
  <tr>
    <td>👶 FirstCry</td>
    <td>🏃 Decathlon</td>
    <td>📚 Kitabay</td>
  </tr>
  <tr>
    <td>💛 Blinkit</td>
    <td>🥦 BigBasket</td>
    <td>🍎 Apple India</td>
  </tr>
</table>

## 🧠 How It Works

### 1. Product Detection
SmartCompare Pro runs a content script that injects non-intrusively into the active tab to extract product data from the DOM, parsing details like title, price, and ID locally without slowing down the page.

### 2. Cross-Platform Matching
Matching occurs across two layers: Layer 1 executes an exact match (ASIN/PID) for high precision, and Layer 2 utilizes Jaccard token similarity for flexible matching across diverse naming conventions.

### 3. Personalized Ranking
Employs a TF-IDF-inspired affinity scoring algorithm to analyze and learn platform preferences, delivering personalized platform ranking customized for every user.

---

<p align="center">Made with ❤️ for Indian shoppers</p>