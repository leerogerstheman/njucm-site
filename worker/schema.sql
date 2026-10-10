-- Comment storage for njucm.org (Cloudflare D1 / SQLite).
--
-- Apply locally:  wrangler d1 execute njucm-comments --local  --file=./schema.sql
-- Apply remotely: wrangler d1 execute njucm-comments --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL,              -- page the comment belongs to
  name        TEXT,                          -- optional display name
  body        TEXT    NOT NULL,              -- plain text, never HTML
  created_at  TEXT    NOT NULL,              -- ISO-8601 UTC
  status      TEXT    NOT NULL DEFAULT 'approved',  -- approved | pending
  ip_hash     TEXT    NOT NULL,              -- salted hash, for rate limits only
  user_agent  TEXT
);

-- Listing a page's approved comments, in order.
CREATE INDEX IF NOT EXISTS idx_comments_slug
  ON comments (slug, status, created_at);

-- Rate limiting by (hashed) client.
CREATE INDEX IF NOT EXISTS idx_comments_ip
  ON comments (ip_hash, created_at);
