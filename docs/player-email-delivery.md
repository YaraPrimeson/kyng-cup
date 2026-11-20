# Player notification emails

The player inbox is populated by the database even when email delivery is disabled.
Emails are transactional and use the verified email of the linked player account.
The worker processes recent events only and uses each notification ID as its Resend
idempotency key. Retries expire after 24 hours.

1. Verify the sender domain in Resend and add a sending API key.
2. Deploy the `player-notification-email` Supabase Edge Function with gateway JWT
   verification disabled. It authenticates requests using its own worker secret.
3. Set `RESEND_API_KEY`, `PLAYER_EMAIL_FROM`, and a randomly generated
   `PLAYER_EMAIL_WORKER_SECRET` in the Edge Function environment. Store the same
   worker secret in Supabase Vault as `player_email_worker_secret`.
4. Enable Supabase Cron and schedule this SQL every five minutes. Confirm the
   function returns HTTP 200 with a verified test recipient before enabling
   delivery for real players.

```sql
select net.http_post(
  url := 'https://omkytvxgjhdjfglnarfe.supabase.co/functions/v1/player-notification-email',
  headers := jsonb_build_object(
    'x-player-email-secret',
    (select decrypted_secret from vault.decrypted_secrets where name = 'player_email_worker_secret')
  ),
  timeout_milliseconds := 120000
);
```
