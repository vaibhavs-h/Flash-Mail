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

// Builds the row to insert; recipient/sender are already resolved by the caller.
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

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

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
