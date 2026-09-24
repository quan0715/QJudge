"""Render private runtime configuration for the bundled media services."""

from __future__ import annotations

import json
from pathlib import Path

from .envfile import write_private
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
        f"cert=/etc/letsencrypt/live/{env['LIVEKIT_TURN_HOST']}/fullchain.pem",
        f"pkey=/etc/letsencrypt/live/{env['LIVEKIT_TURN_HOST']}/privkey.pem",
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


def write_media_config(deploy_dir: Path, env: Env) -> list[str]:
    """Write the private runtime configs under the deployment secrets dir and
    return the services whose config changed."""
    secrets_dir = deploy_dir / "secrets"
    secrets_dir.mkdir(parents=True, exist_ok=True)

    changed = []
    for service, name, contents in (
        ("livekit", "livekit.json", render_livekit_config(env)),
        ("coturn", "turnserver.conf", render_coturn_config(env)),
    ):
        path = secrets_dir / name
        if not path.is_file() or path.read_text(encoding="utf-8") != contents:
            write_private(path, contents)
            changed.append(service)
    return changed

