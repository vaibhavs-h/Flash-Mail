import type { SNSEvent, SNSHandler } from "aws-lambda";
import { simpleParser } from "mailparser";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { buildEmailInsertRow } from "../lib/parseInboundEmail";
import type { SesReceiptNotification } from "../types/ses-notification";

const DOMAIN = process.env.NEXT_PUBLIC_DOMAIN || "flash-mail.vaibhav.rs";

// Core logic factored out from the Lambda entrypoint so tests can inject a fake
// Supabase client instead of hitting a real network call.
export async function processSNSEvent(
  event: SNSEvent,
  supabase: SupabaseClient
): Promise<void> {
  for (const record of event.Records) {
    const notification: SesReceiptNotification = JSON.parse(record.Sns.Message);
    const { content, mail, receipt } = notification;

    if (!content) {
      // Oversized email (exceeded the ~150KB inline-content cap): nothing about a
      // retry fixes this, so log clearly and skip instead of throwing.
      console.warn(
        `[smtpReceiver] Oversized email dropped (no inline content) — ` +
          `messageId=${mail.messageId}. Emails over ~150KB are not currently ` +
          `supported; see serverless/README.md.`
      );
      continue;
    }

    const rawMime = Buffer.from(content, "base64");
    const parsed = await simpleParser(rawMime);

    // Envelope-first, MIME-header-fallback — same precedence as
    // server/smtp-daemon.ts's onData handler.
    const recipientRaw =
      receipt.recipients?.[0] ||
      mail.destination?.[0] ||
      (Array.isArray(parsed.to) ? parsed.to[0]?.text : parsed.to?.text) ||
      `unknown@${DOMAIN}`;
    const recipient = recipientRaw.trim().toLowerCase();

    const sender = mail.source || parsed.from?.text || "Unknown Sender";

    const row = buildEmailInsertRow(parsed, recipient, sender, mail.messageId);

    const { error } = await supabase
      .from("emails")
      .upsert(row, { onConflict: "message_id", ignoreDuplicates: true });

    if (error) {
      // Real failure (not a duplicate — duplicates are absorbed by the upsert
      // above). Throw so Lambda's async retries, then the DLQ, kick in.
      throw new Error(`[smtpReceiver] Supabase upsert failed: ${error.message}`);
    }

    console.log(
      `[smtpReceiver] Stored email for handle "${row.username}" (messageId=${mail.messageId})`
    );
  }
}

export const handler: SNSHandler = async (event) => {
  await processSNSEvent(event, getSupabaseAdmin());
};
