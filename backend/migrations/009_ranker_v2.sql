-- 009_ranker_v2.sql
-- Ranker v2: category-aware affinity + user price profiles

-- 1. Add category to click tracking
ALTER TABLE user_platform_clicks ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- 2. Rebuild user_platform_affinity with category dimension.
--    We preserve existing rows by assigning them category = 'global'.
ALTER TABLE user_platform_affinity ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'global';

-- Drop the old PK and create the new composite one.
-- Use DO block to avoid errors if already migrated.
DO $$
BEGIN
  -- Drop old primary key
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_platform_affinity_pkey'
    AND conrelid = 'user_platform_affinity'::regclass
  ) THEN
    ALTER TABLE user_platform_affinity DROP CONSTRAINT user_platform_affinity_pkey;
  END IF;

  -- Add new composite primary key
  ALTER TABLE user_platform_affinity ADD PRIMARY KEY (user_id, platform, category);
EXCEPTION WHEN duplicate_object THEN
  NULL; -- PK already exists with the right shape
END $$;

-- 3. User price profile table
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id             UUID PRIMARY KEY,
  price_sensitivity   FLOAT DEFAULT 0.5,
  total_comparisons   INTEGER DEFAULT 0,
  cheapest_chosen     INTEGER DEFAULT 0,
  preferred_category  TEXT,
  last_computed_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Sale pre-alert tracking (prevents duplicate pre-alert emails)
CREATE TABLE IF NOT EXISTS sale_prealert_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  product_id    UUID NOT NULL,
  sale_event    TEXT NOT NULL,
  sent_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id, sale_event)
);
