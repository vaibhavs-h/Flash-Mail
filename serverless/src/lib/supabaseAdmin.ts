import WebSocket from "ws";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// createClient() needs a WebSocket polyfill on Node 20, even though Realtime is unused
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;
}

// Lazy singleton, built on first use instead of at import time
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
