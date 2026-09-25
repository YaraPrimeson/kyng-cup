# Telegram bracket management

The `telegram-bracket` Supabase Edge Function lets Telegram users update match results. Access is temporarily open to every Telegram user; each change records the sender's Telegram ID. The function verifies Telegram's webhook secret header before processing an update.

## Setup

The production token and webhook secret are stored encrypted in Supabase Vault under these names:

```text
telegram_bot_token
telegram_webhook_secret
```

Deploy the database migrations and Edge Function, then register the webhook using the decrypted values in a trusted local environment:

```bash
supabase db push
supabase functions deploy telegram-bracket --no-verify-jwt
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://omkytvxgjhdjfglnarfe.supabase.co/functions/v1/telegram-bracket\",\"secret_token\":\"${TELEGRAM_WEBHOOK_SECRET}\",\"allowed_updates\":[\"message\"]}"
```

## Commands

```text
/tournaments
/matches <slug>
/result <slug> <round> <match> <winner 1|2> <score>
/reset <slug> <round> <match>
```

Example: `/result vienna-2026 1 3 1 6-4,3-6,10-8`.
