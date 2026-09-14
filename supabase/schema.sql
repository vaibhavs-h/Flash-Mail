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
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour')
);

-- Keeps the default in sync when this file is re-run against a pre-existing
-- database (CREATE TABLE IF NOT EXISTS above won't touch an existing column).
ALTER TABLE emails ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '1 hour');

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
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'emails'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE emails;
  END IF;
END $$;

-- One row per calendar month, holding a running count of mails received that
-- month. Kept indefinitely (tiny — one row/month) even though the emails
-- themselves are now only kept for 1 hour, so total monthly volume stays
-- visible after the rows that produced it are long gone.
CREATE TABLE IF NOT EXISTS email_monthly_counts (
  month DATE PRIMARY KEY, -- first day of the month, e.g. 2026-09-01
  count INTEGER NOT NULL DEFAULT 0
);

-- Increments the current month's counter every time a new email row lands.
-- Fires on real inserts only — the smtpReceiver's
-- upsert(onConflict: "message_id", ignoreDuplicates: true) turns into
-- INSERT ... ON CONFLICT DO NOTHING, which skips this trigger for duplicate
-- SNS deliveries, so retried/duplicate mail is never double-counted.
CREATE OR REPLACE FUNCTION increment_monthly_email_count()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO email_monthly_counts (month, count)
  VALUES (date_trunc('month', NOW())::date, 1)
  ON CONFLICT (month) DO UPDATE SET count = email_monthly_counts.count + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_monthly_email_count ON emails;
CREATE TRIGGER trg_increment_monthly_email_count
AFTER INSERT ON emails
FOR EACH ROW
EXECUTE FUNCTION increment_monthly_email_count();
