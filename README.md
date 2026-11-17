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

### Sport visibility

`lib/sports-config.json` controls which sports are visible. Tennis is temporarily hidden; set `tennis` to `true` and publish to restore its navigation, page, copy, tournament lists, profile filters and sitemap entry. The static `/tennis/` page redirects to `/padel/` while hidden. Existing tennis data, shared business rules, translations and assets remain intact. New features must support both sports and apply `lib/sports.ts` only at presentation boundaries.


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

Tournament creation checks: `npm run test:setup`. The database scenarios,
coverage and known findings are documented in [the testing guide](docs/tournament-creation-testing.md).
Admin form retention checks (tab focus, session refresh, reload and draft recovery): `npm run test:admin`.

`npm run build:pages` exports both `/` and `/bracket/` into `_site` with the GitHub repository base path applied.

The mobile player profile at `/profile/` uses Supabase authentication, private profiles
and synced settings. My tournaments shows account-linked registrations. History,
achievements and partners use confirmed played results through the authenticated
`get_my_match_history()` RPC. Available tournaments use the public tournament feed.

[My cards](docs/player-cards.md) creates PNGs from completed tournament results in
story (9:16), post (4:5) and square (1:1) formats. Players can include their own profile
photo and share the image through the device share sheet or download it. Main draw
and consolation results remain separate; no sample result or fixed placement is used.
Tennis remains supported by the shared logic and hidden through `lib/sports.ts`.
Partner invitations remain future work.
