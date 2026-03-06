# Anti-Cheat Release Checklist (.env + MinIO + Runtime)

Use this checklist before deploying anti-cheat capture/video features to a remote server.

## 1) Remote `.env` required values

Confirm all values are set and not left as local defaults:

- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`
- `ANTICHEAT_S3_ENDPOINT_URL` (internal endpoint, usually `http://minio:9000`)
- `ANTICHEAT_S3_PUBLIC_ENDPOINT_URL` (public HTTPS endpoint for browser presigned URLs)
- `ANTICHEAT_CORS_ALLOWED_ORIGINS` (frontend origin)
- `MINIO_API_CORS_ALLOW_ORIGIN` (frontend origin)
- `ANTICHEAT_S3_REGION`
- `ANTICHEAT_RAW_BUCKET`
- `ANTICHEAT_VIDEO_BUCKET`
- `ANTICHEAT_PRESIGNED_URL_TTL_SECONDS` (recommended: `300`)

Optional override:

- `ANTICHEAT_S3_ACCESS_KEY`
- `ANTICHEAT_S3_SECRET_KEY`

If optional keys are unset, backend will fallback to `MINIO_ROOT_USER/MINIO_ROOT_PASSWORD`.

Security note:

- Do not use `minioadmin/minioadmin` in production.
- Do not point `ANTICHEAT_S3_PUBLIC_ENDPOINT_URL` to `localhost`.

## 2) Public routing and TLS

Confirm ingress/tunnel routing:

- `ANTICHEAT_S3_PUBLIC_ENDPOINT_URL` host routes to MinIO API (`:9000`), not frontend.
- TLS certificate is valid for the public MinIO host.

Example:

- `https://minio-dev.quan.wtf` -> `http://minio:9000`

## 3) MinIO initialization

After compose startup, run initialization script:

```bash
./scripts/minio/run-init.sh docker-compose.yml
```

Note: `minio-mc-init` compose service is deprecated and removed.

Expected output:

- `[minio-init] completed`

Then verify policy and buckets:

```bash
./scripts/smoke-anticheat-e2e.sh
```

## 4) Runtime service readiness

Verify containers:

```bash
docker compose -f docker-compose.yml ps
```

Must be healthy/running:

- `backend`
- `celery`
- `celery-video`
- `minio`

## 5) DB and worker compatibility

Run migrations before accepting traffic:

```bash
docker compose -f docker-compose.yml exec -T backend python manage.py migrate
```

Quick sanity:

```bash
docker compose -f docker-compose.yml exec -T backend python manage.py check
```

## 6) E2E smoke checks (recommended)

From repo root:

```bash
./scripts/smoke-anticheat-e2e.sh
```

It should verify:

- MinIO buckets exist
- Lifecycle exists
- Presigned URL API returns upload URLs
- URL host is the configured public endpoint

## 7) Post-submit video pipeline

Submit one exam session and verify:

1. raw frames appear in `anticheat-raw`
2. video job is created and consumed by `celery-video`
3. final MP4 appears in `anticheat-videos`
4. raw frames are deleted after success
5. if job fails, raw objects are retained for retry

## 8) Permission and admin UI checks

Verify from frontend:

- only contest managers can access video review endpoints
- video list/play/download works
- mark/unmark suspected flag works

## 9) Rollback plan

Prepare rollback steps before deployment:

- previous image tags
- previous `.env`
- DB backup/snapshot point
- command sequence for service rollback and restart
