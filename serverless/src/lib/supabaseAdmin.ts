import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Deliberately not a re-export of ../../src/lib/supabase/server.ts — that file does
// CWD-relative dotenv.config() loading and has Next-build-time placeholder
// fallbacks, neither applicable here. Lambda env vars come from serverless.yml at
// deploy time (SSM for the service-role key); a cold start should fail loudly if
// they're missing rather than silently falling back to a placeholder.
//
// Constructed lazily (on first call, not at module-import time) so that importing
// this module — or anything that imports it, like smtpReceiver.ts's handler — never
// requires real Supabase env vars to exist just to load the module. The real Lambda
// handler still fails immediately on its very first invocation of a cold start if
// they're missing, which is the same "fail loudly" outcome in CloudWatch either way.

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — check serverless.yml's " +
        "environment config and the SSM parameter at " +
        "/flashmail/<stage>/supabase-service-role-key."
    );
  }

  cached = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return cached;
}
