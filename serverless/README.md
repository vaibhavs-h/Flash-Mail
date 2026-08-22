# Flash Mail — serverless inbound mail receiving

Replaces the EC2 SMTP daemon (`server/smtp-daemon.ts`) and cleaner
(`server/cleaner.ts`) with:

```
SES (inbound-smtp.<region>.amazonaws.com)
  -> receipt rule (recipients: vaibhav.rs apex — Case B, see below)
  -> SNS topic
  -> Lambda: smtpReceiver -> Supabase emails table (upsert on message_id)
                           -> on repeated failure -> SQS DLQ

EventBridge (rate(1 hour))
  -> Lambda: cleaner -> Supabase emails table (delete expired)
```

Deps and tooling live in the **repo root** `package.json`/`node_modules` — there is
no separate `serverless/package.json`. Run every command below from the repo root
unless noted otherwise.

## Before you deploy — mandatory pre-flight checks

These are not optional. Deploying without them risks disrupting unrelated mail flows
or deploying to a region that doesn't support SES inbound receiving at all.

1. **Region**: confirm which AWS region currently supports SES *inbound receiving*
   (a strict subset of all regions — not the same list as SES sending, and not
   necessarily wherever your EC2 instance or Supabase project happen to live).
   Check AWS's current SES "Regions and endpoints" documentation, or:
   ```
   aws ses describe-receipt-rule-set --region <candidate-region> 2>&1
   ```
   A region that doesn't support receiving will error clearly here.
2. **Active receipt rule set** — run in your chosen region:
   ```
   aws ses describe-active-receipt-rule-set --region <region>
   ```
   - **No active rule set** → deploy with `createRuleSet=true` (default). After the
     first deploy, you must manually run (CloudFormation cannot do this step):
     ```
     aws ses set-active-receipt-rule-set --region <region> --rule-set-name flashmail-rule-set
     ```
   - **A rule set is already active** → deploy with `createRuleSet=false` and
     `existingRuleSetName=<that name>`. This adds only Flash Mail's rule to it,
     leaving every other rule in that set untouched.
3. **Isolation check (Case B only — see below)**: confirm `vaibhav.rs` or any of its
   other subdomains don't already carry unrelated mail you'd be capturing by
   verifying the apex domain.

## Deploy

```bash
cd serverless
cp .env.example .env   # fill in SUPABASE_URL, NEXT_PUBLIC_DOMAIN
cd ..

# One-time: put the Supabase service-role key in SSM (never in .env — it's the
# RLS-bypassing key)
aws ssm put-parameter \
  --name /flashmail/prod/supabase-service-role-key \
  --type SecureString \
  --value "<your supabase service role key>" \
  --region <region>

npm run serverless:deploy -- \
  --param="region=<region>" \
  --param="createRuleSet=true|false" \
  --param="existingRuleSetName=<name if createRuleSet=false>" \
  --param="sesRecipients=vaibhav.rs"
```

`sesRecipients` implements the plan's Case A/B split:

- **Case A** (migration only, no random subdomains): `sesRecipients=flash-mail.vaibhav.rs`
- **Case B** (+ random-subdomain addresses, current decision): `sesRecipients=vaibhav.rs`
  — verifying the apex instead of the fixed subdomain. **This is only correct if SES's
  domain-level recipient matching actually covers subdomains, which is unconfirmed.**
  Before trusting this in production, run the Case B end-to-end test below. If it
  fails, fall back to Case A (`flash-mail.vaibhav.rs`) for this rule and keep
  random-subdomain receiving on the EC2 daemon for now — do not force a workaround.

## Testing

```bash
npm run typecheck        # whole repo, includes serverless/
npm run serverless:test  # unit tests: fixtures, oversized-email skip, recipient
                          # precedence, and the duplicate-delivery/message_id test
```

After `sls deploy`, before touching DNS:

```bash
cd serverless
npx sls invoke -f cleaner
npx sls invoke -f smtpReceiver --data '<mock SNS event JSON>'
```

Check CloudWatch Logs for both. Confirm a real Supabase row was written by the
`smtpReceiver` invoke.

**Case B end-to-end test (do this before switching the live MX)**: via a secondary/
test MX setup, send a real email to `<random>.vaibhav.rs` (not just
`flash-mail.vaibhav.rs`) and confirm the receipt rule actually catches it. This is
the concrete test that resolves the subdomain-matching uncertainty above — trust the
test result, not the assumption.

## DLQ — inspecting and reprocessing failed deliveries

A failure only reaches the DLQ after Lambda's own async retries (2 automatic retries)
are exhausted — this means Supabase genuinely failed (not a duplicate; duplicates are
absorbed by the `message_id` upsert).

```bash
aws sqs receive-message --queue-url <SmtpReceiverDLQUrl from stack outputs> --region <region>
```

Each message body wraps the original failed SNS event under `requestPayload`. Once
the underlying issue (e.g. a Supabase outage) is resolved, reprocess by extracting
that payload and re-invoking:

```bash
npx sls invoke -f smtpReceiver --data '<extracted requestPayload>'
```

## Known limitations

- **Oversized emails (>~150KB) are dropped, not queued.** SES's SNS action inlines
  the raw MIME content only up to ~150KB; above that, `content` is absent from the
  notification and `smtpReceiver` logs a warning and skips — there is no S3 fallback
  in this deployment (S3 was considered and explicitly ruled out; see the plan). This
  matches the existing app's behavior of not surfacing attachments.
- **Case B's apex-covers-subdomains assumption is unconfirmed** until the end-to-end
  test above actually passes against a live deployment.

## Rollback

The EC2 SMTP daemon (`server/smtp-daemon.ts`, still deployed via PM2 per
`ecosystem.config.js`) is left running unmodified for 24–72h after the MX cutover.
Reverting is a DNS change back to the EC2 IP — no redeploy needed. See the plan's
Cutover sequence for the full ordered steps.
