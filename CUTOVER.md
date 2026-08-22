# Flash Mail — Deployment & Cutover Guide

Complete step-by-step guide for moving Flash Mail's inbound mail off the EC2 SMTP
daemon and onto AWS SES + Lambda, adding random-subdomain addresses
(`username@<hash>.vaibhav.rs`), and extending retention to 30 days. The web app on
Vercel and the underlying Supabase database stay as they are — this only replaces
how inbound mail gets received.

## Step 1: Ship the EC2 Daemon Fixes

Independent of everything below — do this first, today. Fixes an open-relay
exposure (the daemon currently accepts `RCPT TO` for *any* domain) and bumps email
retention from 7 to 30 days.

SSH into your VPS and pull the latest code:

```bash
ssh root@<YOUR_VPS_IP>
cd Flash-Mail
git pull
```

Restart both PM2 processes so the fix takes effect:

```bash
pm2 restart flashmail-smtp-daemon flashmail-auto-cleaner
```

Confirm the relay fix works — this should now get a `550` rejection instead of
`250 OK`:

```bash
swaks --to someone@example.com --server mail.flash-mail.vaibhav.rs --port 25
```

Watch the logs for the new rejection warning:

```bash
pm2 logs flashmail-smtp-daemon
```

**Optional cleanup** — once the fix above is live, remove the junk rows the relay
probes left behind (`@outlook.com`, `@tiscali.it`, etc.). Real delete against
production data, run only when ready, in the Supabase SQL editor:

```sql
DELETE FROM emails
WHERE recipient NOT ILIKE '%.vaibhav.rs' AND recipient NOT ILIKE '%@vaibhav.rs';
```

## Step 2: Run the Supabase Migration

The new Lambda receiver needs a `message_id` column (with a unique constraint) to
dedupe retried deliveries, and the DB-side retention default needs to move to 30
days.

Open your Supabase project → **SQL Editor**, then paste and run:

```
supabase/migrations/20260821000000_add_message_id_and_extend_retention.sql
```

Confirm it applied:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'emails' AND column_name = 'message_id';
```

## Step 3: Set Up AWS CLI & Confirm Region

SES inbound *receiving* only works in a handful of regions — a different, smaller
list than SES sending, and unrelated to wherever your EC2 box or Supabase project
happen to live. Don't assume; confirm it.

```bash
aws configure
aws sts get-caller-identity
```

Check whether your candidate region supports inbound receiving (your EC2 box's IP
suggests `ap-southeast-2`, but that's only where the *instance* lives — verify SES
separately):

```bash
aws ses describe-receipt-rule-set --region ap-southeast-2
```

Once you have a confirmed region, check for an existing active receipt rule set:

```bash
aws ses describe-active-receipt-rule-set --region <region>
```

Write down the result — you'll need it in Step 6:

- No active rule set → you'll deploy with `createRuleSet=true`
- An existing named rule set → you'll deploy with `createRuleSet=false` and that name

## Step 4: Verify vaibhav.rs Domain in SES

Verify the **apex** domain (`vaibhav.rs`), not just `flash-mail.vaibhav.rs` — this
deployment includes random-subdomain addresses, which need the apex verified.

```bash
aws ses verify-domain-identity --domain vaibhav.rs --region <region>
```

Request DKIM tokens (you'll get three back):

```bash
aws ses verify-domain-dkim --domain vaibhav.rs --region <region>
```

Keep the TXT value and the three DKIM tokens handy — they go into Cloudflare next.

## Step 5: Configure DNS Records (Cloudflare)

> **Watch out:** set the TXT and CNAME records below to **DNS only** (grey cloud),
> not Proxied. A proxied record returns Cloudflare's own IP to anyone checking it,
> which silently breaks domain verification.

| Type  | Name                              | Content / Value                        | Priority | Description |
|-------|-----------------------------------|-----------------------------------------|----------|--------------|
| TXT   | `_amazonses.vaibhav.rs`           | `<value from Step 4>`                   | –        | SES domain ownership verification |
| CNAME | `<token1>._domainkey.vaibhav.rs`  | `<token1>.dkim.amazonses.com`           | –        | DKIM (1 of 3) |
| CNAME | `<token2>._domainkey.vaibhav.rs`  | `<token2>.dkim.amazonses.com`           | –        | DKIM (2 of 3) |
| CNAME | `<token3>._domainkey.vaibhav.rs`  | `<token3>.dkim.amazonses.com`           | –        | DKIM (3 of 3) |
| MX    | `*.vaibhav.rs`                    | `inbound-smtp.<region>.amazonaws.com`   | 10       | New — routes random-subdomain addresses to SES. Additive, does not touch the row below. |
| MX    | `flash-mail.vaibhav.rs`           | `mail.flash-mail.vaibhav.rs` *(unchanged for now)* | 10 | Existing EC2 routing — only changed in Step 9 |

Add the TXT and three CNAME rows now. Add the wildcard MX row now too — it's brand
new address space, so it's safe to add before anything else is live. **Leave the
existing `flash-mail.vaibhav.rs` MX row exactly as it is** until Step 9.

Wait for propagation, then confirm SES sees the domain as verified:

```bash
aws ses get-identity-verification-attributes --identities vaibhav.rs --region <region>
```

## Step 6: Store the Supabase Key & Deploy the Lambda Stack

Put the Supabase service-role key (from your local `.env.local` — the
RLS-bypassing key, never committed) into SSM as a SecureString:

```bash
aws ssm put-parameter \
  --name /flashmail/prod/supabase-service-role-key \
  --type SecureString \
  --value "<your key>" \
  --region <region>
```

Set up the non-secret env file:

```bash
cd serverless
cp .env.example .env   # fill in SUPABASE_URL
cd ..
```

Deploy, from the repo root, using the region and rule-set answer from Step 3:

```bash
npm run serverless:deploy -- \
  --param="region=<region>" \
  --param="createRuleSet=true|false" \
  --param="existingRuleSetName=<if false>" \
  --param="sesRecipients=vaibhav.rs"
```

Note the `SmtpReceiverDLQUrl` stack output for later — that's where failed
deliveries would show up.

## Step 7: Activate the Rule Set & Smoke Test

Skip the first command entirely if Step 3 found an existing active rule set —
CloudFormation can create a new rule set but can't activate one, so this part is
always manual:

```bash
aws ses set-active-receipt-rule-set --region <region> --rule-set-name flashmail-rule-set
```

Invoke both Lambdas directly and check CloudWatch Logs for clean runs:

```bash
cd serverless
npx sls invoke -f cleaner
npx sls invoke -f smtpReceiver --data '<mock SNS event JSON>'
```

Confirm the `smtpReceiver` invoke actually wrote a row into Supabase.

## Step 8: Go Live — Random Subdomain Addresses

This is brand new address space — `flash-mail.vaibhav.rs` keeps working on EC2,
completely untouched, while this goes live alongside it. Low risk.

Send a real email to a made-up address at a random subdomain:

```
test@x7f2k9.vaibhav.rs
```

Confirm it lands in Supabase and shows up in the live inbox UI.

> **Stop here if this fails.** This is the actual test of whether SES's
> domain-level recipient matching covers subdomains — that was unconfirmed going
> into this deployment. If the email doesn't arrive, do not proceed to Step 9. Fall
> back to `sesRecipients=flash-mail.vaibhav.rs` and keep random-subdomain receiving
> on the EC2 daemon for now.

## Step 9: Cut Over flash-mail.vaibhav.rs

Unlike Step 8, this touches address space real users already rely on — go slow,
keep the rollback path live.

Lower the TTL on the existing `flash-mail.vaibhav.rs` MX record in Cloudflare, so a
revert propagates fast if needed. Then switch that record's content:

```
mail.flash-mail.vaibhav.rs  →  inbound-smtp.<region>.amazonaws.com
```

Watch CloudWatch (`smtpReceiver` invocations and errors), the DLQ (should stay
empty), and the Supabase insert rate. Leave the EC2 daemon running, completely
unmodified, for **24–72 hours** — reverting is just a DNS change back, no redeploy.

## Step 10: Decommission EC2

Only once the rollback window in Step 9 is clean, and only when you're ready — no
rush on this one.

```bash
pm2 stop flashmail-smtp-daemon flashmail-auto-cleaner
pm2 delete flashmail-smtp-daemon flashmail-auto-cleaner
```

Then terminate or downsize the instance from your VPS/EC2 provider.

## Vercel

Nothing to do. The frontend change (subdomain-hashed addresses) auto-deploys on
push, same as always. `NEXT_PUBLIC_DOMAIN` isn't read by the frontend anymore —
harmless to leave set in Vercel's env vars, or remove whenever.

After the push deploys, open the live site and confirm it generates a
`username@<hash>.vaibhav.rs` address correctly.

## Verification Commands

Quick reference for checking on things at any point:

```bash
# AWS identity / access
aws sts get-caller-identity

# SES domain + DKIM verification status
aws ses get-identity-verification-attributes --identities vaibhav.rs --region <region>

# Which receipt rule set is active
aws ses describe-active-receipt-rule-set --region <region>

# Lambda smoke tests
cd serverless && npx sls invoke -f cleaner
npx sls invoke -f smtpReceiver --data '<mock SNS event JSON>'

# DLQ contents (should be empty in steady state)
aws sqs receive-message --queue-url <SmtpReceiverDLQUrl> --region <region>

# EC2 daemon (during the rollback window)
pm2 status
pm2 logs flashmail-smtp-daemon

# Repo-level checks
npm run typecheck
npm run serverless:test
```
