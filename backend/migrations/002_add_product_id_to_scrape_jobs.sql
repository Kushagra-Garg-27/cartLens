-- SmartCompare Pro — Migration 002
-- Add product_id FK to scrape_jobs for product-level job tracking

ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_product_id ON scrape_jobs(product_id);

-- Add image_hash column to listings for Layer 3 matching
ALTER TABLE listings ADD COLUMN IF NOT EXISTS image_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_listings_image_hash ON listings(image_hash);
