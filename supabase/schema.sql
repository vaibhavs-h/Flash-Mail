-- Supabase Schema for Temp Mail Service (vaibhavs-h.xyz)

CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient VARCHAR(255) NOT NULL,
  username VARCHAR(255) NOT NULL,
  sender VARCHAR(255) NOT NULL,
  subject TEXT,
  text_body TEXT,
  html_body TEXT,
  raw_headers TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- Indexing for high-performance inbox lookups and expiry cleanup
CREATE INDEX IF NOT EXISTS idx_emails_username ON emails(username);
CREATE INDEX IF NOT EXISTS idx_emails_expires ON emails(expires_at);

-- Enable Supabase Realtime WebSockets on `emails` table
ALTER PUBLICATION supabase_realtime ADD TABLE emails;
