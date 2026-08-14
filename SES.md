# Amazon SES marketing channel

Cloud Mail keeps Resend as the default provider for daily correspondence. Amazon SES is an explicit marketing channel and sends one independently tracked message per primary recipient from `marketing@news.<account-domain>`. Replies go to the user's original Cloud Mail account.

## Worker configuration

Configure these Worker variables and encrypted secrets:

- `AWS_SES_ACCESS_KEY_ID` (secret)
- `AWS_SES_SECRET_ACCESS_KEY` (secret)
- `AWS_SES_REGION=ap-southeast-1`
- `AWS_SES_CONFIGURATION_SET=cloud-mail-marketing`
- `AWS_SES_SNS_TOPIC_ARN=arn:aws:sns:ap-southeast-1:795782340138:cloud-mail-ses-events`
- `SES_MARKETING_ENABLED=false` until SES production access is approved and the end-to-end test passes

The SNS topic must subscribe an HTTPS endpoint to:

`https://tk.turean-polyurea.com/api/webhooks/ses`

Cloud Mail validates the SNS certificate signature, regional AWS hostname and exact topic ARN before it confirms a subscription or accepts an event.

## Database migration

Run the authenticated incremental migration after deploying version 4.1. It adds only the provider columns and indexes; it does not delete existing messages.

## Safety behavior

- SES marketing always enables unsubscribe and Cloud Mail open/click tracking.
- Cc is rejected for the marketing channel to avoid exposing customer addresses and mixing per-recipient tracking.
- Bounces and complaints are added to the existing per-user suppression list.
- Setting `SES_MARKETING_ENABLED=false` immediately removes the SES option from the composer without affecting Resend.
