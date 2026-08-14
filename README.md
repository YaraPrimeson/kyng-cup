# KYNG CUP

Landing page and live tournament bracket for the KYNG CUP tennis and padel community in Vienna.

## Live site

- Landing: https://yaraprimeson.github.io/kyng-cup/
- Bracket: https://yaraprimeson.github.io/kyng-cup/bracket/
- Admin: https://yaraprimeson.github.io/kyng-cup/admin/

## Stack

- React 19 + vinext
- Supabase Postgres, Auth, Row Level Security and Realtime
- GitHub Pages deployment from `main`

The browser uses only a Supabase publishable key. Anonymous visitors can read published, live, and completed tournaments. All writes are protected by authentication, tournament-admin membership, and database RLS policies.

## Bracket model

The initial `vienna-2026` draw contains 16 doubles pairs and 15 matches:

- round of 16: 8 matches
- quarterfinals: 4 matches
- semifinals: 2 matches
- final: 1 match

Each match points to its next match and destination slot. The protected `record_match_result` database function validates the result, stores it in the audit history, and advances the winner atomically.

The admin page supports Supabase email/password authentication. A new account cannot edit results until its user ID is explicitly added to `tournament_admins`.

## Local development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run lint
npm run build
npm run build:pages
```

`npm run build:pages` exports both `/` and `/bracket/` into `_site` with the GitHub repository base path applied.
