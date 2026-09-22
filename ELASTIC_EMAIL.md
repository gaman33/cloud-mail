# Elastic Email marketing channel

Cloud Mail keeps Resend as the default provider for normal correspondence. Elastic Email is the explicit marketing channel and sends one independently tracked message per primary recipient from `marketing@news.<account-domain>`. Replies go to the user's original Cloud Mail account.

## Elastic Email setup

Verify these sending domains in Elastic Email before enabling the channel:

- `news.turean-coating.com`
- `news.turean-polyurea.com`

Create an API key with the minimum access levels `SendHttp` and `ViewReports`.

## Worker configuration

Configure these Cloudflare Worker variables:

- `ELASTIC_EMAIL_API_KEY` as an encrypted secret
- `ELASTIC_EMAIL_ENABLED=true`
- `ELASTIC_EMAIL_API_BASE_URL=https://api.elasticemail.com/v4`
- `ELASTIC_EMAIL_FROM_LOCAL_PART=marketing`
- `ELASTIC_EMAIL_DAILY_RECIPIENT_LIMIT=10000`
- Increase the existing `send_hourly_limit` to match the planned sending window; `1000` supports 10,000 recipients across a ten-hour window.

Remove the obsolete `AWS_SES_*` and `SES_*` variables after the Elastic Email test succeeds.

After deployment, run the authenticated incremental migration. Version `4.3` adds an atomic provider daily-usage table and does not delete existing mail data.

## Starter event synchronization

Elastic Email Starter does not include webhooks. The existing five-minute Worker cron reads `/events` with the `ViewReports` permission and synchronizes delivery delays, failures, bounces, complaints, provider suppressions and unsubscribe events. A rolling overlap and stable event IDs prevent missed or duplicated records.

Open and click tracking stays inside Cloud Mail. Elastic Email provider tracking is disabled to avoid duplicate pixels and rewritten links.

## Compliance behavior

- Marketing sends always enable Cloud Mail tracking and unsubscribe processing.
- Every marketing message includes a visible unsubscribe link.
- `List-Unsubscribe` and `List-Unsubscribe-Post` headers support one-click unsubscribe.
- Bounce, complaint, provider suppression and unsubscribe events add the recipient to the per-user suppression list.
- Future sends to suppressed recipients are blocked.
- Multiple primary recipients are sent independently to protect addresses and preserve per-recipient tracking.
