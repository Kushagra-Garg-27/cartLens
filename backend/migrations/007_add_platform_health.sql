-- SmartCompare Pro — Migration 007: Add Platform Health
-- Creates a table to track scraping attempts and success rates per platform.

CREATE TABLE IF NOT EXISTS platform_health (
  platform        TEXT PRIMARY KEY,
  total_attempts  INTEGER DEFAULT 0,
  success_count   INTEGER DEFAULT 0,
  success_rate    NUMERIC(4,3) DEFAULT 1.0,
  last_failure_at TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Record this migration
INSERT INTO schema_migrations (filename) VALUES ('007_add_platform_health.sql')
ON CONFLICT (filename) DO NOTHING;
