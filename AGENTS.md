# KYNG CUP deployment

- Publish the site by pushing tested changes to `main`.
- The GitHub Actions workflow builds the static site, publishes GitHub Pages, and updates the `hostinger` branch used for `kyngcup.com`.
- Do not use direct Hostinger deployment tools unless the user explicitly asks to replace this workflow.
- Preserve `.github/workflows/pages.yml` unless the user requests a workflow change.
