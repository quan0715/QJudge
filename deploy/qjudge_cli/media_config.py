"""Render private runtime configuration for the bundled media services."""

from __future__ import annotations

import json
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
        },
        "keys": {env["LIVEKIT_API_KEY"]: env["LIVEKIT_API_SECRET"]},
        "turn": {
            "enabled": True,
            "domain": env["LIVEKIT_TURN_HOST"],
            "secret": env["LIVEKIT_TURN_SECRET"],
            "udp_port": 3478,
            "tcp_port": 3478,
            "ttl": 3600,
        },
    }
    return json.dumps(config, indent=2) + "\n"


def render_coturn_config(env: Env) -> str:
    """Return coturn's shared-secret listener and QJudge relay configuration."""
    lines = (
        "listening-port=3478",
        f"listening-ip={env['LIVEKIT_NODE_IP']}",
        f"realm={env['LIVEKIT_TURN_HOST']}",
        "use-auth-secret",
        f"static-auth-secret={env['LIVEKIT_TURN_SECRET']}",
        "min-port=50300",
        "max-port=50399",
        f"external-ip={env['LIVEKIT_NODE_IP']}",
    )
    return "\n".join(lines) + "\n"


def write_media_config(deploy_dir: Path, env: Env) -> tuple[Path, Path]:
    """Write the two private runtime configs under the deployment secrets dir."""
    secrets_dir = deploy_dir / "secrets"
    secrets_dir.mkdir(parents=True, exist_ok=True)

    livekit_path = secrets_dir / "livekit.json"
    coturn_path = secrets_dir / "turnserver.conf"
    livekit_path.write_text(render_livekit_config(env), encoding="utf-8")
    coturn_path.write_text(render_coturn_config(env), encoding="utf-8")
    livekit_path.chmod(0o600)
    coturn_path.chmod(0o600)
    return livekit_path, coturn_path
