# Anti-Cheat Object Storage Release Checklist

Use this checklist before deploying anti-cheat event evidence capture to a remote server.

## 1) Remote `.env` required values

Confirm all values are set and not left as local defaults:

- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`
- `OBJECT_STORAGE_ENDPOINT_URL` (S3-compatible endpoint; R2 or local MinIO)
- `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL` (public HTTPS endpoint for browser presigned URLs)
- `OBJECT_STORAGE_REGION`
- `OBJECT_STORAGE_ACCESS_KEY`
- `OBJECT_STORAGE_SECRET_KEY`
- `OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS` (recommended: `300`)
- `ANTICHEAT_RAW_BUCKET`
- `MARKDOWN_IMAGE_S3_BUCKET`
- `AI_ARTIFACT_S3_BUCKET`

Local MinIO-only values:

- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`
- `MINIO_API_CORS_ALLOW_ORIGIN` (frontend origin)

Security note:

- Do not use `minioadmin/minioadmin` in production.
- Do not point `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL` to `localhost`.

## 2) Public routing and TLS

Confirm ingress/tunnel routing:

- `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL` host routes to the object storage S3 API, not frontend.
- TLS certificate is valid for the public object storage host.

Example:

- `https://minio-dev.quan.wtf` -> `http://minio:9000`

## 3) Local MinIO initialization

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
- `minio` only when using local MinIO instead of R2

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

- object storage buckets exist
- Lifecycle exists
- Presigned URL API returns upload URLs
- URL host is the configured public endpoint

## 7) Event evidence pipeline

Trigger one exam event and verify:

1. bounded window frames appear in `ANTICHEAT_RAW_BUCKET`
2. the related `ExamEvent.metadata.evidence_capture.uploaded_object_keys` contains object keys
3. old compile/video endpoints are not exposed

## 8) Permission and admin UI checks

Verify from frontend:

- only contest managers can access evidence URLs for event screenshots
- TA Live View can subscribe without blocking student work
- student event capture still works when Live View is not open

## 9) Rollback plan

Prepare rollback steps before deployment:

- previous image tags
- previous `.env`
- DB backup/snapshot point
- command sequence for service rollback and restart
