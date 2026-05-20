-- SmartCompare Pro — Migration 002: Platform Expansion
-- Adds image hash support, category indexes, and migration tracking.
-- All statements are idempotent (IF NOT EXISTS / IF NOT EXISTS).

-- ============================================================
-- MIGRATION TRACKING
-- ============================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename    TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LISTINGS — add image_hash for visual matching (Layer 3)
-- ============================================================
ALTER TABLE listings ADD COLUMN IF NOT EXISTS image_hash TEXT;

-- ============================================================
-- PRODUCTS — ensure category and attributes columns exist
-- (001 already creates these, but be safe)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'category'
  ) THEN
    ALTER TABLE products ADD COLUMN category TEXT DEFAULT 'electronics';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'attributes'
  ) THEN
    ALTER TABLE products ADD COLUMN attributes JSONB DEFAULT '{}';
  END IF;
END $$;

-- Set default category for existing rows that have NULL
UPDATE products SET category = 'electronics' WHERE category IS NULL;

-- ============================================================
-- INDEXES
-- ============================================================

-- Category index for NLP Layer 2 queries
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- Image hash index for Layer 3 lookups (partial — only non-null)
CREATE INDEX IF NOT EXISTS idx_listings_image_hash ON listings(image_hash) WHERE image_hash IS NOT NULL;

-- Platform + platform_pid composite index (ensure coverage for new platforms)
CREATE INDEX IF NOT EXISTS idx_listings_platform_pid ON listings(platform, platform_pid);

-- URL index for Layer 4 cache lookups (listings.url is UNIQUE so already indexed, but explicit)
CREATE INDEX IF NOT EXISTS idx_listings_url_scraped ON listings(url, last_scraped_at);

-- Record this migration
INSERT INTO schema_migrations (filename) VALUES ('002_platform_expansion.sql')
ON CONFLICT (filename) DO NOTHING;
