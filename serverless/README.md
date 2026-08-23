# Flash Mail — serverless inbound mail receiving

Live architecture, replacing the old EC2 SMTP daemon and cleaner entirely (EC2 has
been decommissioned — there is no fallback path anymore):

```
SES (inbound-smtp.ap-southeast-2.amazonaws.com)
  -> receipt rule "flashmail-inbound" (no recipient condition — matches every
     address under the verified vaibhav.rs identity: the apex and every subdomain)
  -> SNS topic (flashmail-ses-inbound)
  -> Lambda: smtpReceiver -> Supabase emails table (upsert on message_id)
                           -> on repeated failure -> SQS DLQ
EventBridge (rate(1 hour))
  -> Lambda: cleaner -> Supabase emails table (delete expired)
```

Deps and tooling live in the **repo root** `package.json`/`node_modules` — there is
no separate `serverless/package.json`. Run every command below from the repo root
unless noted otherwise.

Region: **ap-southeast-2**, confirmed to support SES inbound receiving (not every
region does, and it's unrelated to where Supabase or any other infra happens to
live). Rule set: **`flashmail-rule-set`**, created and activated by this deployment
(no pre-existing rule set was found in this account).

## The recipient-matching fix — read this before touching the rule

The single most important non-obvious thing in this setup: **do not set the
`ReceiptRule`'s `Recipients` to a domain string expecting it to cover subdomains —
it doesn't.**

An earlier version of this config set `Recipients: ["vaibhav.rs"]`, expecting that
to match subdomain addresses like `test@x9k2m7.vaibhav.rs` too. It doesn't — SES
matches an explicit recipient condition as an *exact* address or exact domain only.
Confirmed by live testing: a real email to a random subdomain got a hard
`550 5.1.1 Requested action not taken: mailbox unavailable` bounce with that config,
proving SES rejected it during the SMTP transaction itself, before ever reaching
Lambda.

The fix, per the `ReceiptRule` API's own docs ("If this field is not specified,
this rule matches all recipients on all verified domains"): **omit `Recipients`
entirely.** Since `vaibhav.rs` is the only verified identity in this account, an
unconditional rule is exactly the right scope — it covers `flash-mail.vaibhav.rs`
and every generated `username@<hash>.vaibhav.rs` address, with nothing else to
accidentally capture. Confirmed working end-to-end with a real Gmail send after
making this change. This is what `serverless.yml`'s `FlashmailReceiptRule` resource
currently does — don't add a `Recipients` property back without re-testing live.

## Deploy / redeploy

```bash
cd serverless
cp .env.example .env   # fill in SUPABASE_URL
cd ..

# One-time: put the Supabase service-role key in SSM (never in .env — it's the
# RLS-bypassing key)
aws ssm put-parameter \
  --name /flashmail/prod/supabase-service-role-key \
  --type SecureString \
  --value "<your supabase service role key>" \
  --region ap-southeast-2

npm run serverless:deploy -- \
  --param="region=ap-southeast-2" \
  --param="createRuleSet=true"
```

If redeploying into a fresh AWS account (disaster recovery, moving accounts), check
first whether a receipt rule set is already active before assuming
`createRuleSet=true`:

```bash
aws ses describe-active-receipt-rule-set --region ap-southeast-2
```

No active set → `createRuleSet=true` (creates `flashmail-rule-set`, then you must
manually activate it — CloudFormation can't do this step):

```bash
aws ses set-active-receipt-rule-set --region ap-southeast-2 --rule-set-name flashmail-rule-set
```

An active set already exists → `createRuleSet=false` and add
`--param="existingRuleSetName=<that name>"`, so this only adds Flash Mail's rule to
it without touching any other rules already there.

## IAM permissions the deploying user needs

Pieced together from real deploy failures, not guessed upfront — attach all of
these to whatever IAM user runs `serverless:deploy`:

- `AmazonSESFullAccess`, `AmazonSNSFullAccess`, `AWSLambda_FullAccess`,
  `AmazonSQSFullAccess`, `AmazonSSMFullAccess`, `AWSCloudFormationFullAccess`,
  `IAMFullAccess` — the core resources this stack creates.
- `AmazonS3FullAccess` — missed initially; Serverless Framework auto-creates an S3
  bucket to hold deployment artifacts (packaged Lambda code, templates).
- `AmazonEventBridgeFullAccess` — missed initially; the `cleaner` function's hourly
  `schedule` event creates an `AWS::Events::Rule`, which needs its own permissions
  separate from Lambda's.
- `CloudWatchLogsFullAccess` — needed for the `logRetentionInDays` config to manage
  log group retention.

## Known gotchas (from real deployment experience, not theoretical)

- **WebSocket polyfill required**, even though neither Lambda uses Realtime.
  `@supabase/supabase-js`'s `createClient()` unconditionally constructs a Realtime
  client at construction time, which throws `Node.js detected but native WebSocket
  not found` on the `nodejs20.x` runtime (native WebSocket landed in Node 22). Fixed
  in `src/lib/supabaseAdmin.ts` with the same `ws` polyfill pattern the old EC2
  daemon used — don't remove it.
- **AWS's own "Amazon SES Setup Notification"** fires once, automatically, the
  first time this SNS topic is configured as a receipt rule action (and will fire
  again on any future from-scratch stack recreation). Its `content` field is plain
  text, not base64-encoded like real notifications, which corrupts if decoded as
  base64. Handled in `smtpReceiver.ts` by checking for
  `mail.messageId === "AMAZON_SES_SETUP_NOTIFICATION"` and skipping it — not a real
  email, don't remove this guard.
- **`destinations.onFailure` needs the `{ type, arn }` object shape**, not a bare
  `!GetAtt` reference, when pointing at a CloudFormation-managed resource — the
  bare form fails schema validation at `sls deploy` time with a confusing
  "unrecognized property" error.
- **`sls invoke` needs the same `--param` flags as `sls deploy`** (region, etc.) —
  they don't carry over from a previous deploy, since `serverless.yml` reads them
  from custom params, not the standard `--region` CLI flag.
- **A failed first deploy attempt can leave the CloudFormation stack in
  `ROLLBACK_COMPLETE`**, which blocks any further deploy until it's explicitly
  deleted (`aws cloudformation delete-stack` + `aws cloudformation
  wait stack-delete-complete`) — safe to do if nothing in it ever succeeded.

## Testing

```bash
npm run typecheck        # whole repo, includes serverless/
npm run serverless:test  # unit tests: fixtures, oversized-email skip, recipient
                          # precedence, and the duplicate-delivery/message_id test
```

Smoke test either Lambda directly:

```bash
cd serverless
npx sls invoke -f cleaner --param="region=ap-southeast-2" --param="createRuleSet=true"
npx sls invoke -f smtpReceiver --path /path/to/mock-event.json --param="region=ap-southeast-2" --param="createRuleSet=true"
```

Check CloudWatch Logs and confirm a real Supabase row was written.

## DLQ — inspecting and reprocessing failed deliveries

A failure only reaches the DLQ after Lambda's own async retries (2 automatic retries)
are exhausted — this means Supabase genuinely failed (not a duplicate; duplicates are
absorbed by the `message_id` upsert).

```bash
aws sqs receive-message --queue-url <SmtpReceiverDLQUrl from stack outputs> --region ap-southeast-2
```

Each message body wraps the original failed invocation payload under
`requestPayload`. Once the underlying issue is resolved, reprocess by extracting
that payload and re-invoking:

```bash
npx sls invoke -f smtpReceiver --data '<extracted requestPayload>'
```

## Known limitations

- **Oversized emails (>~150KB) are dropped, not queued.** SES's SNS action inlines
  the raw MIME content only up to ~150KB; above that, `content` is absent from the
  notification and `smtpReceiver` logs a warning and skips — there is no S3 fallback
  in this deployment. This matches the app's existing behavior of not surfacing
  attachments.
