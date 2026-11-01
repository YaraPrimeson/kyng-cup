# Telegram bracket management

The `telegram-bracket` Supabase Edge Function currently provides read-only access to tournament lists and matches. Result editing and resetting are temporarily disabled in code, including for valid Telegram webhook messages. The function still verifies Telegram's webhook secret header before processing an update.

The existing result handlers and database functions are preserved. Both result handlers reject requests before looking up a tournament or calling any result-writing RPC. Before enabling `RESULT_EDITING_ENABLED`, implement verified Telegram identity linking and server-side tournament-organiser authorisation for both saving and resetting results. The webhook secret alone authenticates Telegram delivery, not the sender's permission to edit a tournament.

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
```

`/result` and `/reset` return a temporary-disable notice without modifying results. Organisers can continue editing results in the KYNG CUP admin page.

Run the isolated webhook regression checks with `node --test tests/telegram-bracket.test.mjs`. These checks mock all HTTP requests and do not contact Telegram or the production database.

The bot is deployed separately as a Supabase Edge Function. Pushing to `main` publishes the website, but does not update the running bot; deploy `telegram-bracket` as well when changing its code.
