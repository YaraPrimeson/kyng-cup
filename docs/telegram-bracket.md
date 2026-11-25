# Telegram tournament control

Open `/start` or `/admin` in the private bot chat. Confirm the displayed Telegram account in the KYNG CUP admin page and return to `/admin`. A link expires after ten minutes and can be used once. An organiser sees the tournaments allowed by the same shared organiser policy as the website.

- Open a group to see its standings, roster and individual matches. Qualification follows each group's configured number of places. The existing draw builder creates both the main and consolation brackets.
- Start the match and enter games or sets. Use `+1` and `−1` on sets as needed. Confirm the final score and winner to publish the result. An awarded set counts as a set win without adding games to standings.
- Correct a name in the group roster, or replace a player in an unlinked pair before its first match and before its playoff placement. Use the registration tools in the admin page for changes to account-linked pairs.
- Swap two pairs in scheduled matches in one bracket. The bot previews both encounters. It only exchanges starting slots and checks both versions when confirming.
- Finish both brackets before confirming tournament closure. A result correction requires a reason. Group results that can affect a confirmed draw go through the web admin.
- The action journal shows published results, corrections, undo actions, roster changes, swaps and draw approvals.

The Telegram-owned live draft is stored in the database. The website continues to show official results after confirmation, and changes from the website invalidate the previous Telegram draft when the match version changes.

`/tournaments` and `/matches <slug>` provide public read-only access. `/cup` opens the earlier test flow. Use `/admin` to manage real matches.

## Release

Apply the database migration before releasing the static site and Edge Function. The website is published through the GitHub Pages workflow on `main`. The `telegram-bracket` Edge Function is deployed separately with `verify_jwt=false` because it authenticates Telegram's secret webhook header. In the Telegram webhook configuration include both `message` and `callback_query` in `allowed_updates`. Its token and webhook secret are stored in Vault.

Run webhook and SQL regression checks with:

```sh
node --test tests/telegram-bracket.test.mjs tests/telegram-organiser-sql.test.mjs
deno check supabase/functions/telegram-bracket/index.ts
```
