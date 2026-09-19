"""Render the small, environment-specific LiveKit server configuration.

The renderer deliberately uses only the Python standard library.  It writes
JSON, which LiveKit accepts as YAML-compatible configuration, so the output is
easy to validate in CI without adding a YAML dependency to the host setup
script.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import os
import re
from pathlib import Path
from typing import Mapping
from urllib.parse import urlsplit


class ConfigError(ValueError):
    """Raised when the self-hosted LiveKit contract is incomplete or unsafe."""


_ENVIRONMENT_PORTS = {
    "main": {"port": 7880, "tcp_port": 7881, "udp_start": 50000, "udp_end": 50099},
    "dev": {"port": 7883, "tcp_port": 7884, "udp_start": 50100, "udp_end": 50199},
    "test": {"port": 7890, "tcp_port": 7891, "udp_start": 50200, "udp_end": 50299},
}
_TRUE_VALUES = {"1", "true", "yes", "on"}
_LOCAL_HOST_SUFFIXES = (".internal", ".lan", ".local", ".test")
_LOCAL_HOST_LABELS = {"internal", "lan", "local", "private"}
_TURN_PROTOCOLS = {"udp", "tcp"}
_DEFAULT_TURN_PORT = 3478
_DEFAULT_TURN_TTL_SECONDS = 300
_DEFAULT_TURN_RELAY_PORT_START = 50300
_DEFAULT_TURN_RELAY_PORT_END = 50399


def _is_enabled(value: str | None) -> bool:
    return (value or "").strip().lower() in _TRUE_VALUES


def _required(values: Mapping[str, str], name: str) -> str:
    value = (values.get(name) or "").strip()
    if not value:
        raise ConfigError(f"{name} is required when LiveKit is enabled")
    return value


def _validate_url(name: str, value: str, schemes: set[str]) -> str:
    parsed = urlsplit(value)
    if parsed.scheme not in schemes or not parsed.hostname:
        allowed = "/".join(sorted(schemes)).upper()
        raise ConfigError(f"{name} must use {allowed} with a host")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ConfigError(f"{name} must not contain credentials, query, or fragment")
    if parsed.path not in {"", "/"}:
        raise ConfigError(f"{name} must not contain a path")
    return value.rstrip("/")


def _validate_node_ip(value: str) -> str:
    try:
        ipaddress.ip_address(value)
    except ValueError as exc:
        raise ConfigError("LIVEKIT_NODE_IP must be an IP address") from exc
    return value


def _validate_host(name: str, value: str) -> str:
    candidate = value.strip().rstrip(".")
    if not candidate or "://" in candidate or any(
        character.isspace() or character in "/?#" for character in candidate
    ):
        raise ConfigError(f"{name} must be a hostname or IP address without a port")
    try:
        ipaddress.ip_address(candidate)
    except ValueError:
        if not re.fullmatch(
            r"(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*"
            r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?",
            candidate,
        ):
            raise ConfigError(f"{name} must be a hostname or IP address without a port")
    return candidate


def _validate_port(name: str, value: str | None, default: int) -> int:
    candidate = str(value or default).strip()
    try:
        port = int(candidate)
    except (TypeError, ValueError) as exc:
        raise ConfigError(f"{name} must be an integer port") from exc
    if not 1 <= port <= 65535:
        raise ConfigError(f"{name} must be between 1 and 65535")
    return port


def _validate_positive_int(name: str, value: str | None, default: int) -> int:
    candidate = str(value or default).strip()
    try:
        number = int(candidate)
    except (TypeError, ValueError) as exc:
        raise ConfigError(f"{name} must be a positive integer") from exc
    if number <= 0:
        raise ConfigError(f"{name} must be a positive integer")
    return number


def _turn_protocols(value: str | None) -> list[str]:
    protocols = [
        protocol.strip().lower()
        for protocol in (value or "udp,tcp").split(",")
        if protocol.strip()
    ]
    if not protocols or any(protocol not in _TURN_PROTOCOLS for protocol in protocols):
        allowed = ", ".join(sorted(_TURN_PROTOCOLS))
        raise ConfigError(f"LIVEKIT_TURN_PROTOCOLS must contain only {allowed}")
    if len(set(protocols)) != len(protocols):
        raise ConfigError("LIVEKIT_TURN_PROTOCOLS must not contain duplicates")
    return protocols


def _validate_endpoint(
    name: str, value: str, default_port: int
) -> tuple[str, int]:
    candidate = value.strip()
    parsed_value = candidate if "://" in candidate else f"//{candidate}"
    try:
        parsed = urlsplit(parsed_value)
        port = parsed.port or default_port
    except ValueError as exc:
        raise ConfigError(f"{name} must be a host[:port] endpoint") from exc
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ConfigError(f"{name} must not contain credentials, query, or fragment")
    if parsed.path not in {"", "/"}:
        raise ConfigError(f"{name} must not contain a path")

    host = parsed.hostname
    if host is None and "://" not in candidate and candidate.count(":") > 1 and not candidate.startswith("["):
        host = candidate
    if not host:
        raise ConfigError(f"{name} must be a host[:port] endpoint")
    return _validate_host(name, host), port


def _endpoint_host(value: str) -> str:
    candidate = value.strip()
    if "://" in candidate:
        parsed = urlsplit(candidate)
        return parsed.hostname or ""
    if candidate.startswith("["):
        return candidate[1:].split("]", 1)[0]
    if candidate.count(":") == 1:
        return candidate.rsplit(":", 1)[0]
    return candidate


def _is_local_stun_host(value: str) -> bool:
    host = _endpoint_host(value).lower().rstrip(".")
    if not host:
        return False
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        labels = set(host.split("."))
        return (
            host == "localhost"
            or "." not in host
            or host.endswith(_LOCAL_HOST_SUFFIXES)
            or bool(labels & _LOCAL_HOST_LABELS)
        )
    return bool(
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_reserved
    )


def _turn_settings(values: Mapping[str, str]) -> dict | None:
    if not _is_enabled(values.get("LIVEKIT_TURN_ENABLED")):
        return None
    host = _validate_host("LIVEKIT_TURN_HOST", _required(values, "LIVEKIT_TURN_HOST"))
    return {
        "host": host,
        "port": _validate_port(
            "LIVEKIT_TURN_PORT", values.get("LIVEKIT_TURN_PORT"), _DEFAULT_TURN_PORT
        ),
        "protocols": _turn_protocols(values.get("LIVEKIT_TURN_PROTOCOLS")),
        "secret": _required(values, "LIVEKIT_TURN_SECRET"),
        "ttl": _validate_positive_int(
            "LIVEKIT_TURN_TTL_SECONDS",
            values.get("LIVEKIT_TURN_TTL_SECONDS"),
            _DEFAULT_TURN_TTL_SECONDS,
        ),
    }


def _validate_relay_ports(values: Mapping[str, str], environment: str) -> tuple[int, int]:
    start = _validate_port(
        "LIVEKIT_TURN_RELAY_PORT_START",
        values.get("LIVEKIT_TURN_RELAY_PORT_START"),
        _DEFAULT_TURN_RELAY_PORT_START,
    )
    end = _validate_port(
        "LIVEKIT_TURN_RELAY_PORT_END",
        values.get("LIVEKIT_TURN_RELAY_PORT_END"),
        _DEFAULT_TURN_RELAY_PORT_END,
    )
    if start > end:
        raise ConfigError("LiveKit TURN relay port range is invalid")
    livekit_ports = _ports(values, environment)
    turn_port = _validate_port(
        "LIVEKIT_TURN_PORT", values.get("LIVEKIT_TURN_PORT"), _DEFAULT_TURN_PORT
    )
    if turn_port in {livekit_ports["port"], livekit_ports["tcp_port"]} or turn_port in range(
        livekit_ports["udp_start"], livekit_ports["udp_end"] + 1
    ):
        raise ConfigError("LiveKit TURN listening port must not overlap LiveKit ports")
    if start <= turn_port <= end:
        raise ConfigError("LiveKit TURN listening port must not overlap relay ports")
    if start <= livekit_ports["udp_end"] and livekit_ports["udp_start"] <= end:
        raise ConfigError("LiveKit and TURN relay UDP port ranges must not overlap")
    return start, end


def _ports(values: Mapping[str, str], environment: str) -> dict[str, int]:
    defaults = _ENVIRONMENT_PORTS[environment]
    try:
        return {
            key: int(str(values.get(f"LIVEKIT_{key.upper()}") or defaults[key]).strip())
            for key in ("port", "tcp_port", "udp_start", "udp_end")
        }
    except (AttributeError, TypeError, ValueError) as exc:
        raise ConfigError("LiveKit port values must be integers") from exc


def _validate_ports(ports: Mapping[str, int]) -> None:
    if not 1 <= ports["port"] <= 65535:
        raise ConfigError("LIVEKIT_PORT must be between 1 and 65535")
    if not 1 <= ports["tcp_port"] <= 65535:
        raise ConfigError("LIVEKIT_TCP_PORT must be between 1 and 65535")
    if not 1 <= ports["udp_start"] <= ports["udp_end"] <= 65535:
        raise ConfigError("LiveKit UDP port range is invalid")
    if ports["port"] == ports["tcp_port"] or ports["port"] in range(
        ports["udp_start"], ports["udp_end"] + 1
    ):
        raise ConfigError("LiveKit signalling and RTC ports must not overlap")


def _write_config(output_path: Path, rendered: dict) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(rendered, indent=2, sort_keys=True) + "\n")
    output_path.chmod(0o600)


def render_config(values: Mapping[str, str] | None = None, output_path: Path | None = None) -> dict:
    """Validate environment values and optionally write a LiveKit config.

    Disabled deployments receive a deliberately minimal config.  This lets a
    single compose definition keep the service behind the ``live-monitoring``
    profile without making disabled QJudge startup depend on LiveKit secrets.
    """

    values = os.environ if values is None else values
    rendered: dict = {"room": {"auto_create": False, "max_participants": 160}}

    if not _is_enabled(values.get("LIVE_MONITORING_ENABLED")):
        if output_path is not None:
            _write_config(output_path, rendered)
        return rendered

    environment = (values.get("LIVEKIT_ENVIRONMENT") or "dev").strip().lower()
    if environment not in _ENVIRONMENT_PORTS:
        raise ConfigError("LIVEKIT_ENVIRONMENT must be main, dev, or test")

    public_url = _validate_url(
        "LIVEKIT_PUBLIC_URL", _required(values, "LIVEKIT_PUBLIC_URL"), {"ws", "wss"}
    )
    internal_url = _validate_url(
        "LIVEKIT_INTERNAL_URL", _required(values, "LIVEKIT_INTERNAL_URL"), {"http", "https"}
    )
    api_key = _required(values, "LIVEKIT_API_KEY")
    api_secret = _required(values, "LIVEKIT_API_SECRET")
    node_ip = _validate_node_ip(_required(values, "LIVEKIT_NODE_IP"))
    stun_host = _required(values, "LIVEKIT_STUN_HOST")
    stun_endpoint = _validate_endpoint("LIVEKIT_STUN_HOST", stun_host, _DEFAULT_TURN_PORT)
    turn = _turn_settings(values)
    advertise_internal_ip = _is_enabled(values.get("LIVEKIT_ADVERTISE_INTERNAL_IP"))
    if not _is_local_stun_host(stun_host) and not (
        turn
        and stun_endpoint[0].lower() == turn["host"].lower()
        and stun_endpoint[1] == turn["port"]
    ):
        raise ConfigError("LIVEKIT_STUN_HOST must point to the local STUN/TURN service")

    image = _required(values, "LIVEKIT_IMAGE")
    if not re.fullmatch(r"[^\s@]+@sha256:[0-9a-f]{64}", image):
        raise ConfigError("LIVEKIT_IMAGE must be pinned by digest")

    ports = _ports(values, environment)
    _validate_ports(ports)
    if turn:
        _validate_relay_ports(values, environment)

    # ``public_url`` and ``internal_url`` are consumed by QJudge.  Keeping
    # them in the renderer's input, rather than in this server config, avoids
    # accidentally exposing application routing values through LiveKit.
    del public_url, internal_url, image
    rtc = {
        "port_range_start": ports["udp_start"],
        "port_range_end": ports["udp_end"],
        "tcp_port": ports["tcp_port"],
        "use_external_ip": False,
        "node_ip": node_ip,
        "stun_servers": [stun_host],
    }
    if turn:
        rtc["turn_servers"] = [
            {
                "host": turn["host"],
                "port": turn["port"],
                "protocol": protocol,
                "secret": turn["secret"],
                "ttl": turn["ttl"],
            }
            for protocol in turn["protocols"]
        ]
    if advertise_internal_ip:
        rtc["advertise_internal_ip"] = True

    rendered.update(
        {
            "port": ports["port"],
            "rtc": rtc,
            "keys": {api_key: api_secret},
        }
    )
    if output_path is not None:
        _write_config(output_path, rendered)
    return rendered


def render_coturn_config(
    values: Mapping[str, str] | None = None, output_path: Path | None = None
) -> str:
    """Render a host-network coturn config matching LiveKit's TURN settings."""

    values = os.environ if values is None else values
    if not _is_enabled(values.get("LIVE_MONITORING_ENABLED")):
        raise ConfigError("LIVE_MONITORING_ENABLED is required for coturn")
    turn = _turn_settings(values)
    if turn is None:
        raise ConfigError("LIVEKIT_TURN_ENABLED is required for coturn")

    environment = (values.get("LIVEKIT_ENVIRONMENT") or "dev").strip().lower()
    if environment not in _ENVIRONMENT_PORTS:
        raise ConfigError("LIVEKIT_ENVIRONMENT must be main, dev, or test")
    node_ip = _validate_node_ip(_required(values, "LIVEKIT_NODE_IP"))
    turn_local_ip = _validate_node_ip(values.get("LIVEKIT_TURN_LOCAL_IP") or node_ip)
    relay_start, relay_end = _validate_relay_ports(values, environment)
    realm = _validate_host(
        "LIVEKIT_TURN_REALM", values.get("LIVEKIT_TURN_REALM") or turn["host"]
    )
    external_ip = node_ip if turn_local_ip == node_ip else f"{node_ip}/{turn_local_ip}"

    config = "\n".join(
        (
            f"listening-port={turn['port']}",
            "fingerprint",
            "use-auth-secret",
            f"static-auth-secret={turn['secret']}",
            f"realm={realm}",
            f"external-ip={external_ip}",
            f"listening-ip={turn_local_ip}",
            f"relay-ip={turn_local_ip}",
            f"min-port={relay_start}",
            f"max-port={relay_end}",
            "no-tls",
            "no-dtls",
            "no-cli",
            "no-multicast-peers",
            "no-rfc5780",
            "pidfile=/var/tmp/coturn.pid",
            "log-file=stdout",
            "simple-log",
        )
    ) + "\n"
    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(config)
        output_path.chmod(0o600)
    return config


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(os.getenv("LIVEKIT_CONFIG_PATH", "/run/livekit/livekit.json")),
    )
    parser.add_argument("--coturn-output", type=Path)
    args = parser.parse_args()
    render_config(output_path=args.output)
    if args.coturn_output is not None:
        render_coturn_config(output_path=args.coturn_output)
    print(f"LiveKit config rendered to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
