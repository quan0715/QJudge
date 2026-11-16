# QJudge standalone documentation consumer

This consumer installs the independent `@popcornt/mimi` Carbon package. It builds static pages without installing/typechecking the main frontend.

```sh
npm ci
npm run build
```

Output: `build/client`. Articles remain in `../frontend/public/docs`; `frontend/public/docs/config.json` is the single source for branding, locales, navigation and quick links, shared with the embedded app. Files outside the sidebar remain accessible, matching the previous public-directory behavior. Drafts are excluded from generated pages and raw copies.

Mimi is installed from public npm as `@popcornt/mimi`, pinned to an exact version with a lockfile. Source: https://github.com/PopcornT/mimi. No package tarball or private registry credential is committed to this repository.

Deployment workflow `.github/workflows/deploy-docs.yml` builds this consumer and deploys `build/client` to the existing Cloudflare Pages project. No deployment has been performed by this change. The existing Pages canonical-host worker is copied into the output. A top-level `404.html` prevents SPA fallback on unknown paths; verify real HTTP status on the chosen host before switching production.

Legacy `/#/docs/...` links are resolved by the root document in the browser. New paths use `/<locale>/docs/<slug>/`. The main application `/docs/*` route uses Mimi DocsApplication and its Vite content adapter with the same public content/config. App branding and shared language/theme preferences are injected. The main application Markdown renderer remains in place for problems and editors.

Validate the new site on a preview deployment before production. Keep the previous static artifact and lockfile for rollback; reverting only the package version does not restore a changed URL map.

Mimi owns its content and search implementation with no Fumadocs dependency. Rebuild and deploy HTML and search indexes together when upgrading; the index format changed.
