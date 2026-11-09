# Public website ownership

The public website is maintained independently in https://github.com/PopcornT/qjudge-website (private).

- Website: https://www.q-judge.com — Cloudflare Workers Static Assets
- Product application: https://q-judge.com — this repository
- Documentation: https://docs.q-judge.com — this repository

Website build, dependency lockfile, browser tests and deployment workflow belong to the website repository. This repository no longer builds or deploys the public website. Do not restore a Pages deployment here; it could overwrite an obsolete copy.

Public HTML requests to the product homepage continue to redirect to the website with query parameters and fragments retained. Markdown requests and MCP discovery remain served by the existing product ingress/backend.

The old `qjudge-landing` Cloudflare Pages project has been deleted. The proxied `www` CNAME points to `qjudge-website.quan-cs13.workers.dev`, with `www.q-judge.com/*` routed to the Worker. Roll back through Worker deployments or a known-good website commit; do not remove the route expecting Pages fallback.

Local and self-hosted homepage requests now enter `/login`; the existing guest guard routes authenticated users to their normal product destination. Marketing UI and translations are no longer bundled in the product.
