# KYNG CUP deployment

- Keep tennis and padel supported by shared tournament, registration and player features. Tennis is temporarily hidden through `lib/sports-config.json`; use `lib/sports.ts` for UI visibility and filtering instead of removing tennis logic or hardcoding padel-only business rules. Preserve tennis data and pages for future reactivation.

- Publish the site by pushing tested changes to `main`.
- The GitHub Actions workflow builds the static site, publishes GitHub Pages, and updates the `hostinger` branch used for `kyngcup.com`.
- Do not use direct Hostinger deployment tools unless the user explicitly asks to replace this workflow.
- Preserve `.github/workflows/pages.yml` unless the user requests a workflow change.
