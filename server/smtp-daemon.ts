import WebSocket from "ws";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;
}

import { SMTPServer, SMTPServerSession } from "smtp-server";
import { simpleParser, ParsedMail } from "mailparser";
import { supabaseAdmin } from "../src/lib/supabase/server";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 2525;
const DOMAIN = process.env.NEXT_PUBLIC_DOMAIN || "flash-mail.vaibhav.rs";

const server = new SMTPServer({
  name: `mail.${DOMAIN}`,
  banner: `220 mail.${DOMAIN} ESMTP Ready`,
  disabledCommands: ["AUTH"],
  authOptional: true,

  // Accept all incoming recipients
  onRcptTo(address, session, callback) {
    console.log(`[SMTP] Inbound recipient target: ${address.address}`);
    return callback();
  },

  // Parse incoming raw MIME data stream
  onData(stream, session: SMTPServerSession, callback) {
    simpleParser(stream, async (err: Error | null, parsed: ParsedMail) => {
      if (err) {
        console.error("[SMTP Error] Failed to parse MIME email stream:", err);
        return callback(err);
      }

      try {
        // Extract envelope recipient or fallback to parsed header
        const rcptObj = session.envelope.rcptTo[0];
        const recipientRaw =
          (typeof rcptObj === "object" && rcptObj ? rcptObj.address : "") ||
          (Array.isArray(parsed.to) ? parsed.to[0]?.text : parsed.to?.text) ||
          `unknown@${DOMAIN}`;

        const recipient = recipientRaw.trim().toLowerCase();
        const username = recipient.split("@")[0] || recipient;

        const mailFromObj = session.envelope.mailFrom;
        const sender =
          (typeof mailFromObj === "object" && mailFromObj ? mailFromObj.address : "") ||
          parsed.from?.text ||
          "Unknown Sender";

        const subject = parsed.subject || "(No Subject)";
        const textBody = parsed.text || "";
        const htmlBody = (parsed.html as string) || parsed.textAsHtml || parsed.text || "";

        // Format headers string
        const rawHeaders = Array.from(parsed.headers.entries())
          .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
          .join("\n");

        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        console.log(`\n========================================`);
        console.log(`📧 [NEW INCOMING EMAIL]`);
        console.log(`   To:       ${recipient} (${username})`);
        console.log(`   From:     ${sender}`);
        console.log(`   Subject:  ${subject}`);
        console.log(`   Expires:  ${expiresAt}`);
        console.log(`========================================\n`);

        // Insert into Supabase database
        const { data, error } = await supabaseAdmin.from("emails").insert({
          recipient,
          username,
          sender,
          subject,
          text_body: textBody,
          html_body: htmlBody,
          raw_headers: rawHeaders,
          expires_at: expiresAt,
        });

        if (error) {
          console.error("[SMTP Error] Database insertion failed:", error.message);
          return callback(new Error("Database write failure"));
        }

        console.log(`✅ [SMTP] Email successfully saved to Supabase for handle: ${username}`);
        return callback(); // Return 250 OK to sending MTA
      } catch (procErr: any) {
        console.error("[SMTP Exception] Processing error:", procErr);
        return callback(new Error("Internal processing failure"));
      }
    });
  },
});

server.on("error", (err) => {
  console.error("[SMTP Server Error]:", err.message);
});

server.listen(PORT, () => {
  console.log(`\n🚀 [Inbound SMTP Receiver Daemon Running]`);
  console.log(`   Domain Target: ${DOMAIN}`);
  console.log(`   Listening Port: ${PORT}`);
  console.log(`   Ready to receive incoming emails!\n`);
});
