# SmartCompare Pro

Real-time price comparison across Indian e-commerce platforms — Amazon.in, Flipkart, Myntra, Croma, and Ajio.

## Architecture

- **Backend**: Node.js monolith (Express) — API, cron jobs, and scraping in a single process
- **Database**: PostgreSQL 15 (Neon.tech for production, Docker for local dev)
- **Extension**: Chrome Manifest V3 — content scripts extract product data, popup handles auth
- **Scraping**: Playwright + stealth (Amazon, Flipkart, Myntra, Ajio) + Cheerio (Croma)
- **Job Queue**: PostgreSQL-based with `FOR UPDATE SKIP LOCKED` — no Redis needed
- **Email**: Resend.com for watchlist price alerts
- **Auth**: JWT (jsonwebtoken)

## Quick Start (Local Development)

### Prerequisites
- Docker & Docker Compose
- Node.js 20+
- Google Chrome (for extension)

### 1. Start the backend + database

```bash
docker-compose up --build
```

This will:
- Start PostgreSQL 15 and auto-run the migration (`001_initial_schema.sql`)
- Build and start the Express backend on port 3000

### 2. Seed sample data (optional)

```bash
cd backend
npm install
node scripts/seed.js
```

### 3. Verify the backend

```bash
curl http://localhost:3000/api/health
# → { "status": "ok", "db": "connected", "timestamp": "..." }
```

### 4. Load the extension

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension/` directory
5. Click the extension icon → Register/Login
6. Visit a supported product page (Amazon.in, Flipkart, etc.)

## Project Structure

```
├── backend/
│   ├── src/
│   │   ├── index.js          # Express entry + cron
│   │   ├── config.js         # Env validation
│   │   ├── db.js             # PostgreSQL pool
│   │   ├── auth.js           # JWT + bcrypt
│   │   ├── routes/           # API endpoints
│   │   ├── services/         # Business logic
│   │   ├── scrapers/         # Platform scrapers
│   │   ├── cron/             # Background jobs
│   │   ├── middleware/       # Auth, rate limit, logging
│   │   └── utils/            # Text matching, formatting
│   ├── migrations/           # SQL schema
│   ├── scripts/              # Seed data
│   └── tests/                # Jest tests
├── extension/
│   ├── manifest.json         # Manifest V3
│   ├── background.js         # Service worker
│   ├── content.js            # Product extraction + panel
│   ├── popup.html/js/css     # Auth UI
│   └── icons/
└── docker-compose.yml
```

## API Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `POST /api/auth/register` | Public | Create account |
| `POST /api/auth/login` | Public | Login (rate-limited) |
| `POST /api/compare` | Required | Submit product for comparison |
| `GET /api/results/:job_id` | Required | Poll scrape job status |
| `GET /api/history/:product_id` | Required | Price history by platform |
| `POST /api/watchlist` | Required | Add to watchlist |
| `GET /api/watchlist` | Required | List watchlist |
| `DELETE /api/watchlist/:product_id` | Required | Remove from watchlist |
| `GET /api/health` | Public | Health check |

## Running Tests

```bash
cd backend
npm test
```

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and configure:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Min 32 chars |
| `RESEND_API_KEY` | No | For email alerts |
| `PORT` | No | Default: 3000 |

## License

MIT
