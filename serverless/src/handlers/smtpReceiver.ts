import type { SNSEvent, SNSHandler } from "aws-lambda";
import { simpleParser } from "mailparser";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { buildEmailInsertRow } from "../lib/parseInboundEmail";
import type { SesReceiptNotification } from "../types/ses-notification";

const DOMAIN = process.env.NEXT_PUBLIC_DOMAIN || "flash-mail.vaibhav.rs";

// Factored out from the handler so tests can inject a fake Supabase client.
export async function processSNSEvent(
  event: SNSEvent,
  supabase: SupabaseClient
): Promise<void> {
  for (const record of event.Records) {
    const notification: SesReceiptNotification = JSON.parse(record.Sns.Message);
    const { content, mail, receipt } = notification;

    if (mail.messageId === "AMAZON_SES_SETUP_NOTIFICATION") {
      // AWS's automatic one-time setup confirmation, not a real email — skip it.
      console.log("[smtpReceiver] Skipping AWS's own SES setup notification.");
      continue;
    }

    if (!content) {
      // Email exceeded the ~150KB inline-content cap — drop and log, don't retry.
      console.warn(
        `[smtpReceiver] Oversized email dropped (no inline content) — ` +
          `messageId=${mail.messageId}. Emails over ~150KB are not currently ` +
          `supported; see serverless/README.md.`
      );
      continue;
    }

    const rawMime = Buffer.from(content, "base64");
    const parsed = await simpleParser(rawMime);

    // Envelope address first, MIME header only as fallback.
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
      // Real failure, not a duplicate — throw so Lambda retries, then the DLQ.
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
