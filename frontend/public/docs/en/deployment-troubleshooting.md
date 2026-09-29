# Deployment Troubleshooting

When encountering an issue, identify the earliest failure point first rather than immediately restarting all services, rebuilding `deploy/.env`, or removing Docker volumes. In the commands below, `qjudge` refers to your Compose project name (or the custom `COMPOSE_PROJECT_NAME` set in `deploy/.env`). Addons run under the `qjudge-storage` and `qjudge-media` projects.

## First Three Checks

```bash
deploy/qjudge check
docker compose -p qjudge ps --all
docker compose -p qjudge logs --tail=200 <service>
```

- `check` lists any configuration issues in `deploy/.env`. If everything is valid, it prints `…/.env: OK`.
- `ps` shows container health; long-running services should be `running` or `healthy`.
- Inspect logs for specific services depending on the symptom:

| Service | Responsibility |
| --- | --- |
| `frontend` | HTTP ingress and path routing |
| `backend` | Django REST API |
| `celery` | Background tasks and code evaluation (`high_priority`, `default` queues) |
| `ai-service`, `ai-worker` | AI assistant (`ai-worker` contains the scheduler and must be a single replica) |
| `integrity-resident`, `integrity-reconciler` | Exam integrity monitoring |
| `qjudge-mcp` | Remote MCP endpoint |
| `postgres`, `pgbouncer`, `redis` | Database, connection pooling, and message broker |
| `cloudflared` | Cloudflare Tunnel |

## Common `check` Errors

Each error line indicates a key and a failure reason:

- `…: unknown key` — Key is deprecated or unrecognized; compare with `deploy/.env.example` and remove it.
- `…: required.` — A required parameter for your enabled feature is missing.
- `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL: must use https when QJUDGE_PUBLIC_ORIGIN uses https`
- `QJUDGE_PUBLIC_ORIGIN: must not include a path, query, or fragment`
- Database passwords may only contain alphanumeric characters and `-._~` because they are embedded directly into connection URLs.

Note: `init` will refuse to run if `deploy/.env` already exists. Edit the file directly to update settings.

## `upgrade` Failures

The `upgrade` script logs exactly where the process halted:

| Message | Solution |
| --- | --- |
| `N problem(s) in …` | Resolve the errors reported by `check` |
| Git checkout error | Ensure the ref exists on the remote; if `git fetch` failed, only local refs are available |
| `judge image unavailable` | Could not pull from GHCR, and local build of `backend/judge/Dockerfile.judge` also failed. Check earlier Docker build logs |
| `build failed` | Review the Docker build output of the first failing image |
| `postgres is not healthy`, `database backup failed` | Check `postgres` logs and host disk space |
| `secrets bootstrap failed; …`, `<service> migrations failed; …` | Secret generation or database migrations failed. Services continue running the previous version |
| `sha-… is not healthy` | New containers failed health checks within 5 minutes. If a previous version was running, it will automatically roll back |

When rolled back, code is checked out to the previous commit, but the database is not automatically restored. If `Database not restored` is printed, the output provides the command to restore the latest pre-upgrade backup if needed (see Section 9 in the [Deployment Guide](deployment.md)).

Health checks require `backend`, `ai-service`, and `integrity-resident` to be healthy, and frontend's `/api/health/` must respond with HTTP 200 directly.

## Site Inaccessible or Infinite Redirects

Confirm your ingress settings match the output of `deploy/qjudge ingress`. Then, test frontend directly from the reverse proxy host:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H 'Host: judge.example.edu' -H 'X-Forwarded-Proto: https' \
  http://127.0.0.1:8080/api/health/
```

- `200`: QJudge is healthy; investigate reverse proxy, DNS, or SSL certificate issues.
- `400`: The `Host` header does not match the domain in `QJUDGE_PUBLIC_ORIGIN`.
- Connection refused / timed out: Check `FRONTEND_BIND_ADDRESS`, `FRONTEND_PORT`, firewall rules, and ensure `frontend` is running.

If browsers experience infinite redirects, verify that your reverse proxy sets `X-Forwarded-Proto: https`. If the origin is HTTPS and this header is absent, the backend repeatedly responds with HTTP 301.

If user IP addresses in logs always show the reverse proxy's IP, ensure `QJUDGE_TRUSTED_PROXIES` includes your proxy IP and that the proxy appends `X-Forwarded-For`.

## File Upload or Image Display Failures

| Symptom | Check |
| --- | --- |
| Browser shows CORS error | Bundled: Re-run `deploy/qjudge addon storage up` after changing origin. External: Bucket CORS must allow `QJUDGE_PUBLIC_ORIGIN` and `GET`, `PUT`, `HEAD`. |
| `SignatureDoesNotMatch` | Proxy rewrote `Host`, or public URL does not match `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL`. Also verify system clock with `date -u`. |
| `NoSuchBucket` | Bundled: Run `deploy/qjudge addon storage init`. External: Create the bucket named in `OBJECT_STORAGE_BUCKET`. |
| `AccessDenied` | Storage credentials do not have read/write permissions for the bucket. |

Relevant logs: `docker compose -p qjudge logs --tail=200 backend ai-worker`, or for bundled MinIO: `docker compose -p qjudge-storage logs --tail=200 minio`.

## Submissions Stuck in Queue (No Verdict)

```bash
docker compose -p qjudge logs --tail=200 celery
docker image inspect oj-judge:latest --format '{{.Id}}'
```

Code evaluation is executed by `celery` via Docker using the `oj-judge:latest` image. If the image is missing, re-run `upgrade` to pull or build it.

## Live Monitoring Not Working

1. Access `/api/v1/contests/<contest_id>/exam/live/config/`: `enabled: false` indicates `MEDIA_MODE` is disabled or `upgrade` was not re-run; `configured: false` indicates missing parameters.
2. Inspect `docker compose -p qjudge-media logs --tail=200 livekit` and `backend` logs. The backend connects to LiveKit via the HTTPS URL derived from `LIVEKIT_PUBLIC_URL`, so containers must have outbound access to it.
3. If only certain clients cannot connect, inspect UDP/TCP ports on `LIVEKIT_NODE_IP` and verify the port 443 TURN/TLS proxy against `deploy/qjudge ingress`.

## Reporting Issues

When requesting assistance, provide the following sanitized information (remove tokens, passwords, emails, and student data):

```bash
git rev-parse HEAD
cat deploy/.version
docker version
docker compose version
deploy/qjudge check
docker compose -p qjudge ps --all
```

Include relevant logs from failing containers. Never paste the raw contents of `deploy/.env` or `deploy/secrets/`.
