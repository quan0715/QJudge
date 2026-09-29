# File Storage Configuration

While the database stores accounts, problems, and submission records, problem images, proctoring evidence, and AI-generated files are stored in S3-compatible object storage. QJudge stores all files in a single bucket, distinguishing their purpose by the object key prefix.

## Configuration Parameters

| Setting | Purpose |
| --- | --- |
| `STORAGE_MODE` | `bundled`: QJudge runs MinIO locally; `external`: Use an existing service |
| `OBJECT_STORAGE_ENDPOINT_URL` | Endpoint used by containers to connect to storage; defaults to `http://minio:9000` for bundled |
| `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL` | Endpoint used by browsers to access files; must use HTTPS if origin uses HTTPS |
| `OBJECT_STORAGE_ACCESS_KEY`, `OBJECT_STORAGE_SECRET_KEY` | Storage credentials; for bundled, these are MinIO root credentials (secret must be at least 8 characters) |
| `OBJECT_STORAGE_BUCKET` | The bucket name storing all files |
| `MINIO_DATA_DIR` | Optional, host directory for bundled MinIO data; defaults to a Docker volume if omitted |

The bucket remains private. When browsers upload or read files, QJudge generates short-lived presigned URLs based on `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL`. Therefore, this URL must be accessible by user browsers, and the reverse proxy in front must not rewrite the `Host` header. The region is fixed to `us-east-1`. QJudge does not automatically create the bucket on boot.

## Bundled: Running MinIO with QJudge

When selecting `STORAGE_MODE=bundled` during `deploy/qjudge init`, the script fills in the internal endpoint, access key, random secret key, and bucket name (`qjudge`). You only need to provide the public URL, such as `https://storage.example.edu`. Next, start MinIO and initialize the bucket:

```bash
deploy/qjudge addon storage up
deploy/qjudge addon storage init
```

- MinIO runs in a separate Compose project (`<project>-storage`), so running `upgrade` on QJudge will not restart it.
- The S3 API binds to `FRONTEND_BIND_ADDRESS:9000` and is exposed via your reverse proxy or tunnel. Run `deploy/qjudge ingress` to see recommended settings. The proxy must preserve the `Host` header, disable upload size limits, and turn off proxy buffering (`ingress --nginx` includes these).
- The web management console binds only to `127.0.0.1:9001`; connect via SSH port forwarding when needed.
- CORS is automatically configured by MinIO to match `QJUDGE_PUBLIC_ORIGIN`. If you update your origin, re-run `deploy/qjudge addon storage up` to apply changes.
- `addon storage init` is idempotent; existing buckets will not be affected.

MinIO data resides in the volume or `MINIO_DATA_DIR`. It is not included in automatic database backups during `upgrade`, so remember to back it up according to your host backup strategy.

## External: Using Existing S3-Compatible Storage

When using Cloudflare R2, an existing campus MinIO, or AWS S3:

1. Create a private bucket.
2. Create credentials restricted to reading and writing this bucket.
3. Configure bucket CORS to allow QJudge's public origin. Example JSON:

```json
[
  {
    "AllowedOrigins": ["https://judge.example.edu"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Next, write the values into `deploy/.env` (the interactive `init` script will also prompt for them):

```text
STORAGE_MODE=external
OBJECT_STORAGE_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com
OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com
OBJECT_STORAGE_ACCESS_KEY=<access key>
OBJECT_STORAGE_SECRET_KEY=<secret key>
OBJECT_STORAGE_BUCKET=<bucket>
```

In many cloud services, both endpoints are identical. Only separate them if your server accesses storage over an internal network while browsers access it publicly. External mode does not require `addon storage` commands, and `ingress` will not list storage entries.

## Verification

1. Upload an image in the problem Markdown editor, save, and refresh to confirm it renders correctly.
2. Open browser developer tools to verify that upload and download requests point to `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL`.
3. If proctoring or AI features are enabled, verify that evidence files and AI artifacts upload and download normally.

For CORS or signature errors, see [Deployment Troubleshooting](deployment-troubleshooting.md).
