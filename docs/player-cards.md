# My cards

The private profile's My cards view creates downloadable PNGs from the existing
authenticated `get_my_match_history()` RPC. No database migration is required.

- `playerCards` reuses result validation and deduplication from `playerResults`.
  Only completed tournaments with played, confirmed scores appear. Byes,
  scheduled games, inconsistent winners and reset matches are excluded.
- Each tournament, sport and own pair gets a separate entry. The latest dated
  tournament is selected first. Missing dates remain explicitly unknown.
- The main result is the highest played main draw stage, or the group/preliminary
  stage. A played main final win earns Champion. Consolation progress or a
  consolation final victory appears separately and never grants a main title.
  Unknown round metadata never invents a placement or champion title.
- Story (1080×1920), post (1080×1350) and square (1080×1080) images include the
  event, date, player, partner, actual result and valid match/win/loss totals.
- Text supports English, Ukrainian and German. Switching tournament, format,
  language, photo or account invalidates the previous image immediately. Late
  generation responses cannot restore it. Preview URLs are revoked on cleanup.
- SVG text is escaped and fitted to the image. Rendering happens locally through
  SVG and canvas. No email, account ID or private contact details enter the PNG
  or caption. Files are not uploaded to a new image service.
- Including the player's own photo is optional and off by default. Raster photos
  up to 5 MB are fetched without account credentials and embedded before export.
  Fetch/CORS failures omit the photo and show an explanation. Export failures
  show a retry action and do not offer a broken download.
- Native file sharing is invoked directly from the button using a prebuilt PNG.
  Unsupported/failed sharing offers PNG download; cancelling stays silent.
  Download remains available independently of native sharing. A localized post
  caption is available for manual copying.
- `lib/sports.ts` controls visibility. Tennis logic remains supported; tennis
  entries and the redundant single-sport filter stay hidden until reenabled.

## Validation (2026-11-17)

Rules, SVG escaping/dimensions, generation and cleanup, optional photo fallbacks,
account/tournament races, formats, localization, sharing and download are covered
by `tests/result-cards.test.mjs`, `tests/result-card-image.test.mjs`,
`tests/result-cards-ui.test.mjs` and a profile integration check in
`tests/player-account-ui.test.mjs`. These tests use isolated fixtures. The image
export and native share APIs are mocked in interaction tests.

SVGs were also rasterized to real PNGs with Sharp and visually inspected in all
three formats, with and without a photo. This verifies the image artwork, not a
browser's canvas or a phone's share sheet. Browser interaction tools were
unavailable for this change; authenticated production download and real mobile
sharing still need a device check.

The production build, static export via the existing worker harness, lint and
full test suite are checked before publishing. Whole-repo `tsc` still reports the
existing eight Cloudflare/Deno environment type errors, unrelated to cards.
