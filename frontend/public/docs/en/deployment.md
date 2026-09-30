# Deploying QJudge on a Single Host

QJudge runs on a single Linux host using Docker Compose. Configuration, installation, upgrades, and rollbacks are all driven through the `deploy/qjudge` command in the repository. This page guides you through the initial installation in operational order.

Details regarding networking, file storage, live monitoring, and troubleshooting can be found in:
- [Network Ingress and Optional Features](deployment-options.md)
- [Prepare File Storage](deployment-storage.md)
- [Deploy Live Monitoring](deployment-live-monitoring.md)
- [Troubleshoot Deployment](deployment-troubleshooting.md)

## 1. Prerequisites

Your host needs:
- Docker Engine and Docker Compose v2 (`docker compose version` works).
- Git, Python 3 (the CLI only uses the Python standard library), and curl.
- Docker access for the current non-root user (`docker info` shows both Client and Server).

The main QJudge HTTP entry point is `frontend`, bound by default to `127.0.0.1:8080`. HTTPS is provided by a reverse proxy or Cloudflare Tunnel. The main site, bundled MinIO, and LiveKit signaling share one domain by default. Bundled LiveKit still requires a TURN domain and direct TCP/UDP ingress.

## 2. Clone the Repository

```bash
git clone https://github.com/quan0715/QJudge.git
cd QJudge
```

This directory is dedicated to deployment. `upgrade` and `rollback` switch versions using `git checkout --detach`, so do not keep uncommitted work here.

## 3. Initialize Configuration

```bash
deploy/qjudge init
```

The `init` command prompts for required settings, followed by three optional settings (`FRONTEND_BIND_ADDRESS`, `QJUDGE_TRUSTED_PROXIES`, and `MEDIA_MODE`; press Enter to accept defaults):

| Setting | Description |
| --- | --- |
| `QJUDGE_PUBLIC_ORIGIN` | The URL users open in their browsers (e.g. `https://judge.example.edu`); must include scheme, host, and port only |
| `STORAGE_MODE` | `bundled` runs MinIO within QJudge; `external` connects to existing S3-compatible storage. See [Prepare File Storage](deployment-storage.md) |
| `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL` | Optional for bundled storage (uses the main origin); required for external storage, with HTTPS if the origin is HTTPS |
| `FRONTEND_BIND_ADDRESS`, `QJUDGE_TRUSTED_PROXIES` | Leave blank when the reverse proxy is on the same host. See [Network Ingress](deployment-options.md) |
| `MEDIA_MODE` | Live exam monitoring: `disabled` (default), `bundled`, or `external`. See [Deploy Live Monitoring](deployment-live-monitoring.md) |

`init` generates `SECRET_KEY`, three database passwords, and `CREDENTIAL_LEASE_SECRET`. It saves the config to `deploy/.env` with `0600` permissions and creates the `qjudge` Docker network if it does not exist.

You can also run non-interactively:

```bash
deploy/qjudge init --non-interactive \
  --set QJUDGE_PUBLIC_ORIGIN=https://judge.example.edu \
  --set STORAGE_MODE=bundled
```

`deploy/.env` and `deploy/secrets/` are not committed to Git. Keep them backed up securely outside the host.

## 4. Start Bundled Storage and Media

When using `STORAGE_MODE=bundled`, start MinIO and initialize the bucket:

```bash
deploy/qjudge addon storage up
deploy/qjudge addon storage init
```

When using `MEDIA_MODE=bundled`, start LiveKit:

```bash
deploy/qjudge addon media up
```

Addons are separate Compose projects and are not restarted by `upgrade`. Skip this step if using `external` mode.

## 5. Configure Network Ingress

```bash
deploy/qjudge ingress
```

The command lists the main proxy address, storage bucket path, LiveKit signaling URL, TURN domain, ports, and tunnel routes. Adding `--nginx` outputs a ready-to-customize nginx configuration:

```bash
deploy/qjudge ingress --nginx
```

## 6. Install the Release

```bash
deploy/qjudge upgrade origin/main
```

The argument can be a commit SHA, tag, or remote ref. The process will:
1. Fetch and checkout the target version, then run configuration validation.
2. Pull or build the sandboxed judge image.
3. Build application container images on the host.
4. Back up existing databases to `deploy/backups/`.
5. Generate missing secrets and execute database migrations.
6. Start all services and verify health checks until `/api/health/` responds with 200.
7. Record the active version in `deploy/.version`.

Upon success, the output ends with `Upgraded to sha-...`.

## 7. Create Superuser and Verify

```bash
docker compose -p qjudge ps
docker compose -p qjudge exec backend python manage.py createsuperuser
```

Verify the following 4 core items through your browser:
1. Log in with the newly created administrator account.
2. Create a minimal problem.
3. Submit a solution and verify judge evaluation results.
4. Upload an image in the Markdown editor and ensure it persists upon reload.

## 8. Upgrades, Applying Settings, and Rollbacks

To upgrade to a new version:

```bash
deploy/qjudge upgrade <commit SHA or ref>
```

After modifying `deploy/.env`, check settings and apply changes:

```bash
deploy/qjudge check
deploy/qjudge upgrade "$(sed -n 's/^current=//p' deploy/.version)"
```

To roll back to the previous version:

```bash
deploy/qjudge rollback
```

## 9. Backups and Restoration

Each `upgrade` automatically dumps databases to `deploy/backups/<timestamp>-<commit>/online_judge.dump`. To restore:

```bash
docker compose -p qjudge exec -T postgres \
  pg_restore -U qjudge_admin --clean --dbname online_judge \
  < deploy/backups/<id>/online_judge.dump
```
