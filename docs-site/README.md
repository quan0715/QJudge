# QJudge standalone documentation consumer

This consumer installs the independent `@popcornt/mimi` Carbon package. It builds static pages without installing/typechecking the main frontend.

```sh
npm ci
npm run build
```

Output: `build/client`. Articles remain in `../frontend/public/docs`; navigation remains in that directory's `config.json`; section translations come from the existing docs locale files. `docs.config.json` owns this site's branding/domain/locales. Files outside the sidebar remain accessible, matching the previous public-directory behavior. Drafts are excluded from generated pages and raw copies.

Mimi is installed from public npm as `@popcornt/mimi`, pinned to an exact version with a lockfile. Source: https://github.com/PopcornT/mimi. No package tarball or private registry credential is committed to this repository.

Deployment workflow `.github/workflows/deploy-docs.yml` builds this consumer and deploys `build/client` to the existing Cloudflare Pages project. No deployment has been performed by this change. The existing Pages canonical-host worker is copied into the output. A top-level `404.html` prevents SPA fallback on unknown paths; verify real HTTP status on the chosen host before switching production.

Legacy `/#/docs/...` links are resolved by the root document in the browser. New paths use `/<locale>/docs/<slug>/`. The embedded main application `/docs` route remains intact; its separate migration is not part of this standalone consumer.

Validate the new site on a preview deployment before production. Keep the previous static artifact and lockfile for rollback; reverting only the package version does not restore a changed URL map.

Version 0.2.0 owns its content and search implementation with no Fumadocs dependency. Rebuild and deploy HTML and search indexes together when upgrading; the index format changed.
