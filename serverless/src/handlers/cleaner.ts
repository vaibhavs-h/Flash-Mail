import type { ScheduledHandler } from "aws-lambda";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";

// Direct port of server/cleaner.ts's purgeExpiredEmails — unchanged logic, just
// invoked once per EventBridge-scheduled run instead of via setInterval.
export const handler: ScheduledHandler = async () => {
  const now = new Date().toISOString();
  console.log(`[cleaner] Checking for expired emails older than ${now}...`);

  const { error, count } = await getSupabaseAdmin()
    .from("emails")
    .delete({ count: "exact" })
    .lt("expires_at", now);

  if (error) {
    throw new Error(`[cleaner] Supabase delete failed: ${error.message}`);
  }

  console.log(`[cleaner] Purged ${count ?? 0} expired emails.`);
};
