# Cloudflare Deployment Notes

## Current Recommendation

QJudge should keep the production application on Cloudflare Tunnel in front of the Docker Compose host. The app is not a good fit for a single Cloudflare Worker or Pages-only deployment because it depends on Django, Daphne, PostgreSQL, PgBouncer, Redis, Celery workers, Docker-based judging, MinIO-compatible storage, and the MCP service.

Use Cloudflare this way:

- **Cloudflare Tunnel**: public ingress for the Compose services.
- **Cloudflare DNS / proxy**: managed hostnames for `q-judge.com` and service subdomains.
- **Cloudflare Access**: recommended for private operational surfaces such as Grafana, GlitchTip, and MinIO console/API endpoints when they should not be public.
- **Cloudflare R2**: good candidate to replace MinIO buckets for anti-cheat raw screenshots, anti-cheat videos, and markdown images when the backend S3 configuration is ready to use Cloudflare R2 credentials.
- **Cloudflare Pages**: useful for standalone static surfaces such as `www.q-judge.com` landing and later `docs.q-judge.com`, but not a drop-in production replacement unless `/api`, auth cookies, CSRF, uploads, SSE, and service routing are deliberately handled.
- **Workers / D1 / KV**: not the primary fit for the current Django + Compose application.

## MCP Inspection Snapshot

Inspected on 2026-04-24 through the Cloudflare MCP API for account `5c4436c7b498dada4961ff21dfd81595`.

- Zones: `q-judge.com` and `quan.wtf` are active.
- `q-judge.com` plan: Free Website.
- Production tunnel: `QJudge_Production`, tunnel id `71730ffe-e9d4-4c7d-87c7-11c06ab5a85a`, healthy, remotely configured.
- Dev tunnel: `QJudge-Dev`, tunnel id `6180bcd2-1559-4ff4-b09b-5248feed9e3a`, healthy, remotely configured.
- DNS for `q-judge.com` points `q-judge.com`, `minio.q-judge.com`, `grafana.q-judge.com`, `monitor.q-judge.com`, and `mcp.q-judge.com` to the production tunnel CNAME.
- Production tunnel ingress routes:
  - `q-judge.com` -> `http://frontend:80`
  - `minio.q-judge.com` -> `http://minio:9000`
  - `grafana.q-judge.com` -> `http://grafana:3000`
  - `monitor.q-judge.com` -> `http://glitchtip:8000`
  - `mcp.q-judge.com` -> `http://qjudge-mcp:9000`
- Workers: none.
- Pages projects: none.
- D1 databases: none.
- KV namespaces: none.
- R2 buckets: one bucket named `image`.

## Wrangler Configuration

The frontend now has a Wrangler Pages config for the standalone landing deployment at `frontend/wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "qjudge-landing",
  "compatibility_date": "2026-04-24",
  "pages_build_output_dir": "./dist-landing",
  "send_metrics": false
}
```

Available commands:

```bash
cd frontend
npm run build:landing
npm run cf:landing:create
npm run cf:landing:deploy:preview
npm run cf:landing:deploy
```

Treat this as the static landing path for `www.q-judge.com`. The production app should remain on Tunnel at `q-judge.com`.

## Landing CI/CD

Landing deploy is intentionally separate from production app CD:

- Workflow: `.github/workflows/deploy-landing.yml`
- Project: `qjudge-landing`
- Production domain: `https://www.q-judge.com`
- Pages fallback domain: `https://qjudge-landing.pages.dev` redirects to `https://www.q-judge.com`

Required GitHub secret:

```bash
CLOUDFLARE_API_TOKEN
```

The token needs enough permission to deploy the `qjudge-landing` Cloudflare Pages project, for example account-level Pages edit access plus account read access. It does not need access to the remote Docker host or Tailscale deployment secrets.

The existing production app deployment remains:

- Workflow: `.github/workflows/cd-prod.yml`
- Domain: `https://q-judge.com`
- Runtime: Cloudflare Tunnel -> remote Docker Compose host

## Tunnel Operations

Production Compose already runs:

```yaml
cloudflared:
  image: cloudflare/cloudflared:latest
  command: tunnel --no-autoupdate run --token ${TUNNEL_TOKEN}
```

Required production environment variable:

```bash
TUNNEL_TOKEN=<Cloudflare tunnel token for QJudge_Production>
```

Deployment remains the existing path:

```bash
docker compose build
docker compose up -d
```

The remote tunnel config lives in Cloudflare, so route changes should be made through the dashboard/API/Terraform and then verified with MCP.

## R2 Migration Candidate

Use `OBJECT_STORAGE_*` as the canonical connection settings. The older
`MINIO_*` and `ANTICHEAT_S3_*` names remain supported as fallbacks so existing
deployments can switch gradually.

Current production R2 buckets:

| Bucket | Purpose | CORS |
| --- | --- | --- |
| `qjudge-anticheat-raw` | Anti-cheat raw screenshots | `GET`, `PUT`, `HEAD` from `https://q-judge.com` and `https://www.q-judge.com` |
| `qjudge-anticheat-videos` | Anti-cheat compiled videos | `GET`, `PUT`, `HEAD` from `https://q-judge.com` and `https://www.q-judge.com` |
| `qjudge-markdown-images` | Markdown editor images | `GET`, `PUT`, `HEAD` from `https://q-judge.com` and `https://www.q-judge.com` |

Current dev R2 buckets:

| Bucket | Purpose | CORS |
| --- | --- | --- |
| `qjudge-dev-anticheat-raw` | Dev anti-cheat raw screenshots | `GET`, `PUT`, `HEAD` from `https://q-judge-dev.quan.wtf`, `http://localhost:5173`, and `http://127.0.0.1:5173` |
| `qjudge-dev-anticheat-videos` | Dev anti-cheat compiled videos | `GET`, `PUT`, `HEAD` from `https://q-judge-dev.quan.wtf`, `http://localhost:5173`, and `http://127.0.0.1:5173` |
| `qjudge-dev-markdown-images` | Dev Markdown editor images | `GET`, `PUT`, `HEAD` from `https://q-judge-dev.quan.wtf`, `http://localhost:5173`, and `http://127.0.0.1:5173` |

Dev `.env` example:

```bash
OBJECT_STORAGE_ENDPOINT_URL=https://<account_id>.r2.cloudflarestorage.com
OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=https://<account_id>.r2.cloudflarestorage.com
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_ACCESS_KEY=<dev_r2_access_key_id>
OBJECT_STORAGE_SECRET_KEY=<dev_r2_secret_access_key>

ANTICHEAT_CORS_ALLOWED_ORIGINS=https://q-judge-dev.quan.wtf,http://localhost:5173,http://127.0.0.1:5173
ANTICHEAT_RAW_BUCKET=qjudge-dev-anticheat-raw
MARKDOWN_IMAGE_S3_BUCKET=qjudge-dev-markdown-images
MARKDOWN_IMAGE_PUBLIC_BASE_URL=https://q-judge-dev.quan.wtf
```

Production `.env` example:

```bash
OBJECT_STORAGE_ENDPOINT_URL=https://<account_id>.r2.cloudflarestorage.com
OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=https://<account_id>.r2.cloudflarestorage.com
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_ACCESS_KEY=<r2_access_key_id>
OBJECT_STORAGE_SECRET_KEY=<r2_secret_access_key>

ANTICHEAT_RAW_BUCKET=qjudge-anticheat-raw
MARKDOWN_IMAGE_S3_BUCKET=qjudge-markdown-images
MARKDOWN_IMAGE_PUBLIC_BASE_URL=https://q-judge.com
```

Before switching from MinIO to R2:

1. Create separate buckets for raw anti-cheat images, anti-cheat videos, and markdown images.
2. Configure CORS for browser direct uploads from `https://q-judge.com`.
3. Decide lifecycle policies for raw images and videos.
4. Update production `.env` with `OBJECT_STORAGE_*` first, leaving old MinIO vars in place only as rollback notes.
5. Restart backend and Celery, then smoke-test presigned uploads/downloads.
6. Remove MinIO from the critical path only after the smoke test and one real exam-like capture flow pass.

## Dev MinIO to R2 Migration

Local dev objects can be copied from the self-hosted MinIO service into the dev
R2 buckets with:

```bash
scripts/r2/migrate-dev-minio-to-r2.sh --dry-run
scripts/r2/migrate-dev-minio-to-r2.sh --apply
```

The script runs inside the dev backend container so it can read MinIO through the
Docker network at `http://minio:9000`, while writing to the currently configured
`OBJECT_STORAGE_*` target. It never deletes source or target objects.

Useful scoped runs:

```bash
scripts/r2/migrate-dev-minio-to-r2.sh --dry-run --only raw
scripts/r2/migrate-dev-minio-to-r2.sh --apply --only markdown --prefix markdown/2026/04/
```
