# Email tracking setup

This fork stores delivery, open, click, bounce, complaint, delay, and failure events in Cloudflare D1. Sent-message details show an event timeline, open/click counts, IP address, approximate Cloudflare location, and user-agent information when those fields are available.

## Required deployment steps

1. Deploy the updated Worker, sign in as the administrator, and call `POST /api/admin/migrate`. New installations can call `POST /api/init` with the secret in the `x-init-secret` header. Secrets are never placed in URLs.
2. In Resend, create a webhook pointing to `https://YOUR_WORKER_DOMAIN/api/webhooks`.
3. Subscribe to `email.sent`, `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`, `email.delivery_delayed`, `email.failed`, and `email.suppressed`.
4. Enable Resend click tracking for the sending domain and verify its tracking subdomain. Cloud Mail supplies its own open pixel, but `email.clicked` requires Resend click tracking.
5. Copy the webhook signing secret (`whsec_...`) into the Worker secret named `resend_webhook_secret`:

   ```sh
   wrangler secret put resend_webhook_secret
   ```

6. Set Cloud Mail's existing `customDomain` setting to the public Worker domain. This domain is used for the tracking pixel URL. It must serve this Worker over HTTPS.

The webhook returns HTTP 503 until `resend_webhook_secret` is configured. Invalid signatures return HTTP 400. Resend event retries are deduplicated using `svix-id`.

## Privacy and accuracy

Tracking occurs only for newly sent external messages. Historical and internal messages show no tracking data. Image blocking can prevent open events; Apple Mail Privacy Protection and other image proxies can create proxy opens and proxy IP addresses. The UI therefore describes these as detected events, not proof that the recipient personally read the message.

When one message is sent to multiple recipients at once, open events are message-level and cannot identify which recipient loaded the shared pixel. Send one recipient per message when customer-level attribution is required.

IP addresses and user-agent data are deleted when their associated email, account, or user is permanently deleted.
