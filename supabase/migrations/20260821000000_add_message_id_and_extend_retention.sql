-- Migration for the already-live Supabase `emails` table.
-- Safe to run more than once — every statement tolerates re-running without erroring.
--
-- Run this in the Supabase SQL editor (or `supabase db push` once the CLI is linked
-- and logged in) against the production project. Not run automatically as part of
-- this repo change.

-- 1. Add message_id (nullable) for SES mail.messageId dedup.
ALTER TABLE emails ADD COLUMN IF NOT EXISTS message_id TEXT;

-- 2. Drop the old partial unique index if an earlier draft of this migration ever
--    created it — harmless no-op if it never existed.
DROP INDEX IF EXISTS idx_emails_message_id_unique;

-- 3. Real UNIQUE constraint (not a partial index) so Supabase's
--    upsert(row, { onConflict: "message_id" }) has a valid conflict target.
--    Postgres treats every NULL as distinct for uniqueness, so this still allows
--    unlimited NULL message_id rows from the (unmodified) EC2 SMTP daemon.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'emails_message_id_unique'
  ) THEN
    ALTER TABLE emails ADD CONSTRAINT emails_message_id_unique UNIQUE (message_id);
  END IF;
END $$;

-- 4. Retention: 7 days -> 30 days for all new rows going forward.
--    Column defaults aren't retroactive, hence step 5.
ALTER TABLE emails ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '30 days');

-- 5. Extend already-stored, not-yet-expired rows out to the new 30-day window too,
--    so nothing currently sitting in an inbox vanishes early on its old 7-day
--    schedule. Only touches still-live rows; does not resurrect anything already
--    expired/deleted. Idempotent: re-running only pushes expires_at further out for
--    rows still live at that later time, never shrinks it.
UPDATE emails
SET expires_at = created_at + INTERVAL '30 days'
WHERE expires_at > NOW();
