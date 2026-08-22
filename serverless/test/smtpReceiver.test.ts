import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SNSEvent } from "aws-lambda";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processSNSEvent } from "../src/handlers/smtpReceiver";

// No test framework exists elsewhere in this repo (root package.json's "test:smtp"
// is a plain tsx script) — matching that convention here rather than introducing
// jest/vitest for one test file. Run with: tsx test/smtpReceiver.test.ts

const FIXTURES_DIR = path.join(__dirname, "fixtures");

// --- Fake Supabase client: simulates just enough of `.from("emails").upsert(row,
// { onConflict, ignoreDuplicates })` against an in-memory Map keyed by message_id,
// mirroring the real UNIQUE(message_id) constraint's semantics (same key -> no
// second row; NULL/undefined keys never collide with each other). ---
function createFakeSupabase() {
  const rowsByMessageId = new Map<string, Record<string, unknown>>();
  const upsertCalls: Record<string, unknown>[] = [];

  const client = {
    from(table: string) {
      assert.equal(table, "emails");
      return {
        async upsert(
          row: Record<string, unknown>,
          opts: { onConflict: string; ignoreDuplicates?: boolean }
        ) {
          upsertCalls.push(row);
          const key = row[opts.onConflict] as string | undefined;
          if (key && rowsByMessageId.has(key)) {
            // Conflict on message_id + ignoreDuplicates: true -> DO NOTHING,
            // exactly like the real UNIQUE constraint + upsert would.
            return { data: null, error: null };
          }
          if (key) rowsByMessageId.set(key, row);
          return { data: [row], error: null };
        },
      };
    },
  };

  return {
    client: client as unknown as SupabaseClient,
    rowsByMessageId,
    upsertCalls,
  };
}

interface MockEventOpts {
  fixture: string;
  messageId: string;
  recipients?: string[]; // receipt.recipients
  destination?: string[]; // mail.destination
  sender: string; // mail.source
  includeContent?: boolean; // default true; false simulates the >150KB case
}

function buildMockSNSEvent(opts: MockEventOpts): SNSEvent {
  const raw = readFileSync(path.join(FIXTURES_DIR, opts.fixture));
  const base64Content = raw.toString("base64");

  const notification: Record<string, unknown> = {
    notificationType: "Received",
    mail: {
      timestamp: new Date().toISOString(),
      messageId: opts.messageId,
      source: opts.sender,
      destination: opts.destination ?? opts.recipients ?? [],
    },
    receipt: {
      timestamp: new Date().toISOString(),
      recipients: opts.recipients ?? [],
    },
  };
  if (opts.includeContent !== false) {
    notification.content = base64Content;
  }

  return {
    Records: [
      {
        EventVersion: "1.0",
        EventSubscriptionArn: "arn:aws:sns:ap-southeast-2:000000000000:test:fixture",
        EventSource: "aws:sns",
        Sns: {
          Type: "Notification",
          MessageId: `sns-${opts.messageId}`,
          TopicArn: "arn:aws:sns:ap-southeast-2:000000000000:flashmail-ses-inbound",
          Subject: "Amazon SES Email Receipt Notification",
          Message: JSON.stringify(notification),
          Timestamp: new Date().toISOString(),
          SignatureVersion: "1",
          Signature: "fixture-signature",
          SigningCertUrl: "https://example.com/cert.pem",
          UnsubscribeUrl: "https://example.com/unsubscribe",
          MessageAttributes: {},
        },
      },
    ],
  } as unknown as SNSEvent;
}

type Test = { name: string; run: () => Promise<void> };
const tests: Test[] = [];
const test = (name: string, run: () => Promise<void>) => tests.push({ name, run });

test("plain-text fixture: derives fields with envelope taking priority over headers", async () => {
  const { client, rowsByMessageId } = createFakeSupabase();
  const event = buildMockSNSEvent({
    fixture: "plain-text.eml",
    messageId: "test-plain-001",
    recipients: ["Alice@a1b2c3.vaibhav.rs"], // deliberately different from fixture's To: header
    sender: "envelope-sender@example.com", // deliberately different from fixture's From: header
  });

  await processSNSEvent(event, client);

  assert.equal(rowsByMessageId.size, 1);
  const row = rowsByMessageId.get("test-plain-001")!;
  assert.equal(row.recipient, "alice@a1b2c3.vaibhav.rs"); // trimmed + lowercased
  assert.equal(row.username, "alice");
  assert.equal(row.sender, "envelope-sender@example.com"); // envelope wins, not the fixture's From: header
  assert.equal(row.subject, "Plain text test email"); // from mailparser, not the envelope
  assert.match(row.text_body as string, /This is a plain text test email body\./);
  assert.equal(row.message_id, "test-plain-001");

  const expiresAt = new Date(row.expires_at as string).getTime();
  const expectedExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
  assert.ok(
    Math.abs(expiresAt - expectedExpiry) < 60_000,
    "expires_at should be ~30 days out, not 7"
  );
});

test("html-email fixture: html_body is parsed correctly", async () => {
  const { client, rowsByMessageId } = createFakeSupabase();
  const event = buildMockSNSEvent({
    fixture: "html-email.eml",
    messageId: "test-html-001",
    recipients: ["bob@d4e5f6.vaibhav.rs"],
    sender: "sender@example.com",
  });

  await processSNSEvent(event, client);

  const row = rowsByMessageId.get("test-html-001")!;
  assert.equal(row.username, "bob");
  assert.match(row.html_body as string, /<strong>HTML<\/strong>/);
});

test("large-email fixture (comfortably under 150KB): still processed normally", async () => {
  const { client, rowsByMessageId } = createFakeSupabase();
  const event = buildMockSNSEvent({
    fixture: "large-email.eml",
    messageId: "test-large-001",
    recipients: ["carol@g7h8i9.vaibhav.rs"],
    sender: "sender@example.com",
  });

  await processSNSEvent(event, client);

  const row = rowsByMessageId.get("test-large-001")!;
  assert.equal(row.username, "carol");
  assert.ok((row.text_body as string).length > 50_000, "large fixture body should be large");
});

test("oversized email (content absent): skipped without throwing, no row written", async () => {
  const { client, upsertCalls } = createFakeSupabase();
  const event = buildMockSNSEvent({
    fixture: "plain-text.eml", // fixture content doesn't matter here, content is omitted below
    messageId: "test-oversized-001",
    recipients: ["dave@j1k2l3.vaibhav.rs"],
    sender: "sender@example.com",
    includeContent: false,
  });

  await assert.doesNotReject(() => processSNSEvent(event, client));
  assert.equal(upsertCalls.length, 0, "an oversized email must not be written to Supabase");
});

test("recipient precedence: receipt.recipients wins over mail.destination when they differ", async () => {
  const { client, rowsByMessageId } = createFakeSupabase();
  const event = buildMockSNSEvent({
    fixture: "plain-text.eml",
    messageId: "test-precedence-001",
    recipients: ["priority@m4n5o6.vaibhav.rs"],
    destination: ["other@p7q8r9.vaibhav.rs"],
    sender: "sender@example.com",
  });

  await processSNSEvent(event, client);

  const row = rowsByMessageId.get("test-precedence-001")!;
  assert.equal(row.recipient, "priority@m4n5o6.vaibhav.rs");
});

test("duplicate SNS delivery: same mail.messageId delivered twice -> exactly one row", async () => {
  const { client, rowsByMessageId, upsertCalls } = createFakeSupabase();
  const event = buildMockSNSEvent({
    fixture: "plain-text.eml",
    messageId: "test-message-id-001",
    recipients: ["dupe@s1t2u3.vaibhav.rs"],
    sender: "sender@example.com",
  });

  // 1. First delivery.
  await processSNSEvent(event, client);
  assert.equal(rowsByMessageId.size, 1, "first delivery should write one row");

  // 2. Second delivery of the SAME event (same mail.messageId) — simulates an SNS
  //    redelivery/retry, which is exactly the scenario the message_id UNIQUE
  //    constraint + upsert(onConflict: "message_id", ignoreDuplicates: true) exists
  //    to guard against.
  await processSNSEvent(event, client);

  assert.equal(upsertCalls.length, 2, "both deliveries should reach the upsert call");
  assert.equal(
    rowsByMessageId.size,
    1,
    "still exactly one row after a duplicate delivery, not two"
  );
});

async function main() {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.run();
      console.log(`  PASS  ${t.name}`);
    } catch (err) {
      failed++;
      console.error(`  FAIL  ${t.name}`);
      console.error(err instanceof Error ? err.stack ?? err.message : err);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  if (failed > 0) process.exit(1);
}

main();
