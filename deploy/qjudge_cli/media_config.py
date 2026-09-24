"""Render private runtime configuration for the bundled media services."""

from __future__ import annotations

import json
import os
from pathlib import Path

from .schema import Env


def render_livekit_config(env: Env) -> str:
    """Return the LiveKit configuration for the bundled QJudge media addon."""
    config = {
        "port": 7880,
        "rtc": {
            "tcp_port": 7881,
            "port_range_start": 50000,
            "port_range_end": 50099,
            "node_ip": env["LIVEKIT_NODE_IP"],
            "use_external_ip": False,
            "turn_servers": [
                {
                    "host": env["LIVEKIT_TURN_HOST"],
                    "port": port,
                    "protocol": protocol,
                    "secret": env["LIVEKIT_TURN_SECRET"],
                    "ttl": 3600,
                }
                for protocol, port in (("udp", 3478), ("tcp", 3478), ("tls", 443))
            ],
        },
        "keys": {env["LIVEKIT_API_KEY"]: env["LIVEKIT_API_SECRET"]},
    }
    return json.dumps(config, indent=2) + "\n"


def render_coturn_config(env: Env) -> str:
    """Return coturn's shared-secret listener and QJudge relay configuration."""
    lines = (
        "listening-port=3478",
        "tls-listening-port=5349",
        "cert=/etc/letsencrypt/live/qjudge-media/fullchain.pem",
        "pkey=/etc/letsencrypt/live/qjudge-media/privkey.pem",
        "no-tlsv1",
        "no-tlsv1_1",
        f"realm={env['LIVEKIT_TURN_HOST']}",
        "use-auth-secret",
        f"static-auth-secret={env['LIVEKIT_TURN_SECRET']}",
        "proc-user=nobody",
        "proc-group=nogroup",
        "fingerprint",
        "min-port=50300",
        "max-port=50399",
        f"external-ip={env['LIVEKIT_NODE_IP']}",
        "no-tcp-relay",
        "no-multicast-peers",
        # Relayed media only ever goes to LiveKit's advertised address; an
        # allowed-peer-ip entry overrides the denied ranges.
        "denied-peer-ip=0.0.0.0-255.255.255.255",
        "denied-peer-ip=::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
        f"allowed-peer-ip={env['LIVEKIT_NODE_IP']}",
        "no-cli",
        "log-file=stdout",
        "simple-log",
    )
    return "\n".join(lines) + "\n"


def write_media_config(deploy_dir: Path, env: Env) -> tuple[Path, Path]:
    """Write the two private runtime configs under the deployment secrets dir."""
    secrets_dir = deploy_dir / "secrets"
    secrets_dir.mkdir(parents=True, exist_ok=True)

    livekit_path = secrets_dir / "livekit.json"
    coturn_path = secrets_dir / "turnserver.conf"
    _write_private_file(livekit_path, render_livekit_config(env))
    _write_private_file(coturn_path, render_coturn_config(env))
    return livekit_path, coturn_path


def _write_private_file(path: Path, contents: str) -> None:
    """Write a private file, restricting an existing file before truncation."""
    if path.exists():
        path.chmod(0o600)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        output.write(contents)
