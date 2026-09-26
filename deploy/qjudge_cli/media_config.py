"""Render private runtime configuration for the bundled media addon."""

from __future__ import annotations

import json
from pathlib import Path

from .envfile import write_private
from .schema import Env

# LiveKit advertises TURN/TLS as turns:<domain>:443 and expects the host proxy
# to terminate TLS and forward plain TCP to this listener.
TURN_TCP_PORT = 5349


def render_livekit_config(env: Env) -> str:
    """Return the LiveKit configuration, with its embedded TURN server."""
    config = {
        "port": 7880,
        "rtc": {
            "tcp_port": 7881,
            "port_range_start": 50000,
            "port_range_end": 50099,
            "node_ip": env["LIVEKIT_NODE_IP"],
        },
        "turn": {
            "enabled": True,
            "domain": env["LIVEKIT_TURN_HOST"],
            "udp_port": 3478,
            "tls_port": TURN_TCP_PORT,
            "external_tls": True,
            "relay_range_start": 50300,
            "relay_range_end": 50399,
        },
        "keys": {env["LIVEKIT_API_KEY"]: env["LIVEKIT_API_SECRET"]},
    }
    return json.dumps(config, indent=2) + "\n"


def write_media_config(deploy_dir: Path, env: Env) -> bool:
    """Write the LiveKit config under the deployment secrets dir and return
    whether it changed."""
    path = deploy_dir / "secrets" / "livekit.json"
    contents = render_livekit_config(env)
    if path.is_file() and path.read_text(encoding="utf-8") == contents:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    write_private(path, contents)
    return True
