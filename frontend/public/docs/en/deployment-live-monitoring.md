# Live Monitoring Configuration

Exam live monitoring uses LiveKit: students publish their screen shares and webcams, and TAs or instructors select individual students to view in real time. This is an optional feature; if LiveKit is unavailable, the UI clearly displays that live monitoring is temporarily offline, while answering, submitting, and background proctoring snapshots proceed normally.

## Choosing a Mode

| `MEDIA_MODE` | Description |
| --- | --- |
| `disabled` or empty | Do not use live monitoring |
| `bundled` | QJudge runs LiveKit as an addon, utilizing LiveKit's built-in TURN server |
| `external` | Connect to an existing external LiveKit deployment |

Configuration settings required when enabled:

| Setting | Purpose |
| --- | --- |
| `LIVEKIT_PUBLIC_URL` | Public endpoint for browser WebSocket connections, e.g. `wss://live.example.edu` |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | LiveKit API credentials |
| `LIVEKIT_NODE_IP` | Bundled only: The media IP announced to browsers, usually your server's public IP |
| `LIVEKIT_TURN_HOST` | Bundled only: TURN domain, resolving directly to your host's IP without CDN proxying |

The backend calls the LiveKit API using a URL derived from `LIVEKIT_PUBLIC_URL` (replacing `wss://` with `https://`). Therefore, the backend container must also be able to reach this address.

## Bundled

Set `MEDIA_MODE=bundled`, `LIVEKIT_PUBLIC_URL`, `LIVEKIT_NODE_IP`, and `LIVEKIT_TURN_HOST` in `deploy/.env` (the interactive `init` script will prompt for these if bundled is selected), then run:

```bash
deploy/qjudge addon media init
deploy/qjudge addon media up
deploy/qjudge ingress
```

- `addon media init` generates API credentials if `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` are blank, writing them to `.env`. It leaves existing values unchanged.
- `addon media up` generates `deploy/secrets/livekit.json` based on `.env` and starts the service. LiveKit runs in an isolated Compose project (`<project>-media`), so regular QJudge `upgrade` runs will not restart it.
- Finally, re-run `upgrade` with the current version so the backend loads the new `MEDIA_MODE` (see [Deployment Guide](deployment.md), Section 8).

Run `ingress` to view the necessary network entry points:

| Entry Point | Configuration |
| --- | --- |
| `LIVEKIT_PUBLIC_URL` domain | Reverse proxy to `FRONTEND_BIND_ADDRESS:7880` with WebSocket support enabled. When using Cloudflare Tunnel, route to `http://livekit:7880`. |
| Media & TURN ports | Open TCP `7881`, UDP `50000-50099`, UDP `3478`, and UDP `50300-50399` directly on `LIVEKIT_NODE_IP`, or forward them from your firewall/router. |
| TURN/TLS | LiveKit announces `turns:<LIVEKIT_TURN_HOST>:443`. The host reverse proxy terminates TLS on port 443 using the TURN domain certificate and forwards raw TCP to `FRONTEND_BIND_ADDRESS:5349`. |

`ingress --nginx` includes a sample nginx `stream` configuration for TURN. The example assumes the TURN domain resolves to a dedicated IP address on your host, while the main website binds to another IP, allowing both to use port 443 simultaneously. Certificates are managed on the host and require reloading the proxy after renewal.

When updating LiveKit, its image version is defined in `deploy/addons/media/compose.yml`. Apply updates after upgrading QJudge by running `deploy/qjudge addon media up`.

## External

Set `MEDIA_MODE=external`, `LIVEKIT_PUBLIC_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`, then re-run `upgrade` with your current version. No `addon media` commands are needed; TURN, network ports, and certificates are managed by your external LiveKit cluster.

## Verification

1. Access `/api/v1/contests/<contest_id>/exam/live/config/` as an exam manager or student. It should return `enabled: true`, `configured: true`, and `provider: "livekit"`.
2. Run a practice exam with a test device to confirm the student can publish screens/cameras, the instructor can switch between feeds, and streams terminate upon submission.
3. Test with at least one device on a restricted network (where only port 443 is open) to verify the TURN/TLS path works properly.

## Deactivation and Cleanup

When no active exams are running, set `MEDIA_MODE=disabled` and re-run `upgrade`. To terminate any leftover LiveKit rooms from a specific exam:

```bash
docker compose -p qjudge exec backend python manage.py close_live_monitoring_room \
  --contest-id <contest_id> --run-id <run_id>
```

Omitting `--confirm` performs a dry run. Adding `--confirm` closes the room without affecting student data or submitted files.
