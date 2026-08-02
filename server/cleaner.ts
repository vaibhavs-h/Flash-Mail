import WebSocket from "ws";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;
}

import { supabaseAdmin } from "../src/lib/supabase/server";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function purgeExpiredEmails() {
  const now = new Date().toISOString();
  console.log(`[Cleaner] Checking for expired emails older than 7 days (lt ${now})...`);

  try {
    const { data, error, count } = await supabaseAdmin
      .from("emails")
      .delete({ count: "exact" })
      .lt("expires_at", now);

    if (error) {
      console.error("[Cleaner Error]:", error.message);
    } else {
      console.log(`[Cleaner] Successfully purged ${count ?? 0} expired emails.`);
    }
  } catch (err: any) {
    console.error("[Cleaner Exception]:", err.message);
  }
}

// Run immediately on startup, then every 1 hour
purgeExpiredEmails();
setInterval(purgeExpiredEmails, 60 * 60 * 1000);
