-- 008_add_scraped_title_and_offers.sql
-- Stores per-platform scraped title for spec extraction,
-- plus bank offers and coupon codes scraped from PDPs.

ALTER TABLE listings ADD COLUMN IF NOT EXISTS scraped_title TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS bank_offers JSONB DEFAULT '[]';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS coupon_codes JSONB DEFAULT '[]';

-- Index for quick spec comparisons across listings of the same product
CREATE INDEX IF NOT EXISTS idx_listings_product_scraped
  ON listings(product_id) WHERE scraped_title IS NOT NULL;
