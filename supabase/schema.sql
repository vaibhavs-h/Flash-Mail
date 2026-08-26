-- Supabase schema for Temp Mail Service (flash-mail.vaibhav.rs and *.vaibhav.rs)

CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient VARCHAR(255) NOT NULL,
  username VARCHAR(255) NOT NULL,
  sender VARCHAR(255) NOT NULL,
  subject TEXT,
  text_body TEXT,
  html_body TEXT,
  raw_headers TEXT,
  message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

-- Speeds up inbox lookups and expiry cleanup
CREATE INDEX IF NOT EXISTS idx_emails_username ON emails(username);
CREATE INDEX IF NOT EXISTS idx_emails_expires ON emails(expires_at);

-- Dedupes duplicate SNS deliveries via upsert(onConflict: "message_id")
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'emails_message_id_unique'
  ) THEN
    ALTER TABLE emails ADD CONSTRAINT emails_message_id_unique UNIQUE (message_id);
  END IF;
END $$;

-- Enable Supabase Realtime on the emails table
ALTER PUBLICATION supabase_realtime ADD TABLE emails;
