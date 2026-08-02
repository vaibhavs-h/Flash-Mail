import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import WebSocket from "ws";

if (typeof globalThis.WebSocket === "undefined") {
  // Polyfill WebSocket for Node.js environments < 22
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;
}

dotenv.config({ path: ".env.local" });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
