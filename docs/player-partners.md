# My partners

The private profile's My partners section uses the existing authenticated
`get_my_match_history()` RPC. No database migration, new permissions, profile
directory or contact lookup is needed.

- `playerPartners` in `lib/player-results.ts` reuses `playerResults` validation
  and deduplication. Only played matches with a valid confirmed score count.
  Scheduled games, byes and reset or inconsistent results do not create partners.
- Linked partners aggregate by account ID and sport. Names are display labels,
  not identity keys. An unlinked appearance is scoped to tournament, pair and
  sport; matching names never merge separate appearances or linked accounts.
- Cards sort by distinct shared tournaments, then played matches, then the
  latest known appearance date. Date display prefers match completion time and
  falls back to the tournament date. Unknown dates are labelled explicitly.
- Shared tournament totals include ongoing tournaments with played matches.
  Established duo progress counts only distinct completed tournaments, using
  the existing achievement rules for that partner and sport.
- Expanding a card shows shared matches, opponents, player-relative scores,
  stages and dates. Unlinked appearances explain the existing organiser-code
  process instead of granting combined cross-tournament history.
- Visibility uses `lib/sports.ts`. Tennis remains supported by grouping and
  filters, but its cards, matches and statistics are hidden while disabled.
- `usePlayerMatches` is shared with History and Achievements. Responses are
  scoped to the current account and request revision; stale account responses
  cannot restore a previous player's data. Errors remain distinct from empty
  histories and offer retry.

UI text supports Ukrainian, English and German. Partner names are historical
application names; this section does not read another player's private profile
or photo. Invitations and partner search remain separate future work.

Validation: `npm test`, `npm run lint`, and `git diff --check`. Partner rules and
React interactions are covered in `tests/player-results.test.mjs`,
`tests/player-results-ui.test.mjs` and `tests/player-account-ui.test.mjs`.
These tests use isolated fixtures, not production player accounts.
