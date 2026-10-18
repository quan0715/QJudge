# Dokploy host agent

This adapter keeps an existing **raw Compose Dokploy app** in charge of services
and Traefik routes. It is separate from the standard CLI agent container. It runs
as a host systemd service because native builds and the Dokploy API live on the
host. Python 3, Git, Docker, and passwordless `sudo docker` are required.

The tracked branch is `dev` for staging; `main` is also supported. The backend
HTTP API remains the same. The agent binds only to the app's Docker bridge
address and requires the shared bearer token. Do not publish the agent port via
Traefik or the public network.

## Host configuration

Create a private JSON file, for example `runtime/agent-config.json` (mode 0600):

```json
{
  "repo": "/home/ubuntu/qjudge-staging",
  "runtime": "/home/ubuntu/qjudge-staging-runtime",
  "branch": "dev",
  "compose_id": "YOUR_DOKPLOY_COMPOSE_ID",
  "project": "YOUR_DOKPLOY_APP_NAME",
  "network": "qjudge-staging",
  "public_origin": "https://staging.example.com",
  "api_url": "http://127.0.0.1:3000/api",
  "api_key_file": "/home/ubuntu/qjudge-staging-runtime/dokploy-api-key",
  "token_file": "/home/ubuntu/qjudge-staging-runtime/agent-token",
  "listen_host": "172.19.0.1",
  "agent_url": "http://172.19.0.1:8090",
  "port": 8090,
  "systemd_unit": "qjudge-staging-agent.service",
  "ingress": [
    {"id": "site", "public": "https://staging.example.com", "target": "Traefik → frontend:80", "probe": "https://staging.example.com/api/health/", "expect": "200"},
    {"id": "mcp", "public": "https://staging.example.com/mcp", "target": "frontend → qjudge-mcp:9000", "probe": "https://staging.example.com/mcp", "expect": "reachable"}
  ]
}
```

Use the real network gateway and existing routes. Add storage and media entries
only when those routes exist. `reachable` tests HTTP connectivity (1xx–4xx), not
successful authentication or an entire WebSocket/media session. The adapter
preserves the staging ARM seccomp additions (`AARCH64`, `ARM`, `statx`).

Generate the token once, keep it mode 0600, and retain it across upgrades. The
backend reads it through a read-only mount; no token goes into browser responses.

Point `runtime/agent-current` at an extracted release's `deploy/` directory.
Install a systemd service using that as `WorkingDirectory`, with:

```ini
[Unit]
Description=QJudge Dokploy staging agent
After=docker.service network-online.target
Requires=docker.service

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/qjudge-staging-runtime/agent-current
ExecStart=/usr/bin/python3 -m qjudge_cli.dokploy --config /home/ubuntu/qjudge-staging-runtime/agent-config.json serve
Restart=on-failure
UMask=0077
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

If the host firewall rejects container-to-host traffic, allow TCP 8090 only
from this app's bridge interface and subnet to its gateway address. Persist
that scoped rule using the host firewall tooling; do not open public ingress.
Verify a backend-container request without a token gets HTTP 401.

The service user needs permission to restart this specific unit through sudo.
The deployment runner atomically updates `agent-current` after success and then
restarts this service. It records completion before the restart.

## One deployment path

Both web jobs and SSH CD run `DokployAgentService` and `Deployment.execute()`:

1. Acquire `runtime/.release.lock`; validate the exact tracked-branch SHA.
2. Archive the pinned commit into `runtime/releases/<SHA>` and build native images.
3. Back up both databases and the current raw Compose file.
4. Preserve volumes, secrets, routes and unrelated images; set QJudge image tags
   and mount the agent token in the backend.
5. Ask Dokploy to deploy without fresh volumes; wait for its result, all expected
   containers/images, and public HTTP health.
6. Save `deployed.json`, update the agent code symlink and restart the agent.

Point the existing SSH forced-command wrapper at:

```sh
cd /home/ubuntu/qjudge-staging-runtime/agent-current
exec python3 -m qjudge_cli.dokploy --config /home/ubuntu/qjudge-staging-runtime/agent-config.json ssh
```

The `ssh` entry only accepts `deploy-staging <40-character SHA>` from
`SSH_ORIGINAL_COMMAND`. GitHub's workflow does not need an API token or a new
command. Switch the old wrapper only while no legacy deployment is running;
the old `deployment.lock` must not remain an independent deployment path.

Web requests get HTTP 409 when another deployment holds the lock. CD waits for
the same lock, then skips a superseded SHA or an already deployed healthy SHA.
Web calls may redeploy the latest SHA for diagnostics. Both sources record jobs
and logs in `runtime/.agent/`; no process-local-only busy flag is used.

A failed job keeps the last successful deployment record and its backup. A
failure during the switch can leave partially updated services; recovery is
explicit, not an automatic database restore. Do not delete the private backups
or treat an HTTP timeout as proof that the deployment did not start.
