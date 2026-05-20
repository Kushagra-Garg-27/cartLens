-- SmartCompare Pro — Initial Schema
-- PostgreSQL 15

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name  TEXT NOT NULL,
  brand           TEXT,
  category        TEXT,
  model_number    TEXT,
  ean             TEXT,
  isbn            TEXT,
  attributes      JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_model_number ON products(model_number);
CREATE INDEX IF NOT EXISTS idx_products_ean ON products(ean);

-- ============================================================
-- LISTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS listings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID REFERENCES products(id) ON DELETE CASCADE,
  platform          TEXT NOT NULL,
  url               TEXT UNIQUE NOT NULL,
  platform_pid      TEXT,
  current_price     NUMERIC(10,2),
  currency          TEXT DEFAULT 'INR',
  availability      TEXT,
  match_confidence  NUMERIC(3,2),
  match_method      TEXT,
  last_scraped_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listings_product_id ON listings(product_id);
CREATE INDEX IF NOT EXISTS idx_listings_platform ON listings(platform);
CREATE INDEX IF NOT EXISTS idx_listings_platform_pid ON listings(platform_pid);

-- ============================================================
-- PRICE HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS price_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  price         NUMERIC(10,2) NOT NULL,
  availability  TEXT,
  source        TEXT DEFAULT 'scraper',
  scraped_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_listing_scraped
  ON price_history(listing_id, scraped_at DESC);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- WATCHLIST
-- ============================================================
CREATE TABLE IF NOT EXISTS watchlist (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  target_price    NUMERIC(10,2),
  last_alerted_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id);

-- ============================================================
-- SCRAPE JOBS
-- ============================================================
CREATE TABLE IF NOT EXISTS scrape_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_url TEXT NOT NULL,
  platform    TEXT NOT NULL,
  status      TEXT DEFAULT 'pending',
  priority    INT DEFAULT 5,
  attempts    INT DEFAULT 0,
  last_error  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  run_after   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status_priority_run
  ON scrape_jobs(status, priority, run_after);
