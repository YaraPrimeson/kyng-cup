# Telegram bracket management

The `telegram-bracket` Supabase Edge Function lets the authorised organiser update match results from Telegram. It accepts messages only from Telegram user `169658777` and verifies Telegram's webhook secret header before processing an update.

## Setup

Set these production secrets. Never commit their values:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
```

Deploy the database migration and Edge Function, then register the webhook:

```bash
supabase db push
supabase secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=...
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
