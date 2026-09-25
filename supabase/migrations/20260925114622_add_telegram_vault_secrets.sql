-- The bot token and webhook secret live encrypted in Supabase Vault. Only the
-- service role used by the Edge Function can request their decrypted values.
create or replace function public.telegram_bot_secrets()
returns table(bot_token text, webhook_secret text)
language sql
security definer
set search_path = ''
as $$
  select
    max(decrypted_secret) filter (where name = 'telegram_bot_token') as bot_token,
    max(decrypted_secret) filter (where name = 'telegram_webhook_secret') as webhook_secret
  from vault.decrypted_secrets
  where name in ('telegram_bot_token', 'telegram_webhook_secret');
$$;

revoke all on function public.telegram_bot_secrets() from public, anon, authenticated;
grant execute on function public.telegram_bot_secrets() to service_role;
