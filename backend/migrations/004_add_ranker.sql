-- 004_add_ranker.sql
-- Personalized platform ranker: click tracking + affinity scores

-- Records every time a user clicks a platform link in the panel
CREATE TABLE IF NOT EXISTS user_platform_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  product_id UUID NOT NULL,
  chosen_platform TEXT NOT NULL,
  chosen_price INTEGER,
  -- Prices of other options at the time of click (for learning signal)
  alternatives JSONB, -- [{ platform, price }]
  clicked_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clicks_user ON user_platform_clicks(user_id);

-- Aggregated platform affinity scores per user (updated after each click)
CREATE TABLE IF NOT EXISTS user_platform_affinity (
  user_id UUID NOT NULL,
  platform TEXT NOT NULL,
  -- Raw click count
  click_count INTEGER DEFAULT 0,
  -- Times user chose this platform even when cheaper options existed
  preferred_over_cheaper INTEGER DEFAULT 0,
  -- Average price premium accepted (positive = paid more, negative = always chose cheaper)
  avg_premium_accepted FLOAT DEFAULT 0.0,
  -- TF-IDF-inspired affinity score (recomputed after each update)
  affinity_score FLOAT DEFAULT 0.5,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, platform)
);
