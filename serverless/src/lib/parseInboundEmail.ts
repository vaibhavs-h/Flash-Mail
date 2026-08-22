import type { ParsedMail } from "mailparser";

export interface EmailInsertRow {
  recipient: string;
  username: string;
  sender: string;
  subject: string;
  text_body: string;
  html_body: string;
  raw_headers: string;
  message_id: string;
  expires_at: string;
}

// Port of server/smtp-daemon.ts's onData subject/textBody/htmlBody/rawHeaders/
// expiresAt derivation — unchanged except expiresAt (30 days, was 7) and the added
// message_id (from SES's mail.messageId, absent in the original since the EC2
// daemon has no equivalent field). recipient/sender are derived by the caller
// (smtpReceiver.ts) via the envelope-first/header-fallback chain and passed in
// already resolved, mirroring how the original code derives them before this point.
export function buildEmailInsertRow(
  parsed: ParsedMail,
  recipient: string,
  sender: string,
  messageId: string
): EmailInsertRow {
  const username = recipient.split("@")[0] || recipient;

  const subject = parsed.subject || "(No Subject)";
  const textBody = parsed.text || "";
  const htmlBody = (parsed.html as string) || parsed.textAsHtml || parsed.text || "";

  const rawHeaders = Array.from(parsed.headers.entries())
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join("\n");

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  return {
    recipient,
    username,
    sender,
    subject,
    text_body: textBody,
    html_body: htmlBody,
    raw_headers: rawHeaders,
    message_id: messageId,
    expires_at: expiresAt,
  };
}
