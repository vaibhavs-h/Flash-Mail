-- Supabase Schema for Temp Mail Service (flash-mail.vaibhav.rs and *.vaibhav.rs)
--
-- This file is the fresh-install snapshot. For an already-live database, run the
-- idempotent migration in supabase/migrations/ instead — CREATE TABLE IF NOT EXISTS
-- does not retroactively alter an existing table.

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

-- Indexing for high-performance inbox lookups and expiry cleanup
CREATE INDEX IF NOT EXISTS idx_emails_username ON emails(username);
CREATE INDEX IF NOT EXISTS idx_emails_expires ON emails(expires_at);

-- message_id: from SES's mail.messageId, used by the Lambda smtpReceiver to dedupe
-- duplicate SNS deliveries via upsert(onConflict: "message_id"). NULL for rows
-- inserted by the EC2 SMTP daemon (which doesn't set it) — a plain UNIQUE constraint
-- allows unlimited NULLs in Postgres, so this doesn't collide with itself.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'emails_message_id_unique'
  ) THEN
    ALTER TABLE emails ADD CONSTRAINT emails_message_id_unique UNIQUE (message_id);
  END IF;
END $$;

-- Enable Supabase Realtime WebSockets on `emails` table
ALTER PUBLICATION supabase_realtime ADD TABLE emails;
