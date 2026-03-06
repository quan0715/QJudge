# MinIO Public Endpoint Setup (Anti-Cheat Direct Upload)

For browser direct upload, students must be able to reach MinIO API over HTTPS.

For production deployment validation, see:

- `scripts/minio/RELEASE_CHECKLIST.md`

## 1) Recommended public endpoint

Use a dedicated subdomain:

- `https://minio-dev.quan.wtf`

Do **not** use `localhost` in presigned URLs for remote users.

## 2) Required DNS / tunnel routing

Your ingress must route the MinIO subdomain to MinIO API service (`:9000`), not frontend.

Example target:

- `minio-dev.quan.wtf` -> `http://minio:9000`

## 3) Required environment variables

Set these in `.env`:

- `ANTICHEAT_S3_PUBLIC_ENDPOINT_URL=https://minio-dev.quan.wtf`
- `ANTICHEAT_CORS_ALLOWED_ORIGINS=https://q-judge-dev.quan.wtf`
- `MINIO_API_CORS_ALLOW_ORIGIN=https://q-judge-dev.quan.wtf`

Then recreate services:

```bash
docker compose -f docker-compose.dev.yml up -d --force-recreate minio backend
./scripts/minio/run-init.sh docker-compose.dev.yml
```

`run-init.sh` is idempotent and safe to run on every deployment (recommended for CI/CD).

## 4) Verify

1. Start exam and pass precheck.
2. Check `GET /exam/anticheat-urls` returns `put_url` host as `minio-dev.quan.wtf`.
3. Check `anticheat-raw` bucket receives `*.webp`.
