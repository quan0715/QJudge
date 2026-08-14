#!/usr/bin/env python3
"""Create a non-active production environment candidate for the next release."""

from __future__ import annotations

import argparse
import os
import secrets
import string
from pathlib import Path
from urllib.parse import urlsplit


ROTATED_KEYS = {
    "QJUDGE_PUBLIC_ORIGIN",
    "POSTGRES_ADMIN_PASSWORD",
    "DB_PASSWORD",
    "AI_DB_PASSWORD",
    "CREDENTIAL_LEASE_SECRET",
    "DOCKER_GID",
    "DOCKER_SOCKET_UID",
}
PRESERVED_REQUIRED_KEYS = {
    "SECRET_KEY",
    "DB_PASSWORD",
    "OBJECT_STORAGE_ENDPOINT_URL",
    "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL",
    "OBJECT_STORAGE_ACCESS_KEY",
    "OBJECT_STORAGE_SECRET_KEY",
}


def parse_env(lines: list[str]) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        normalized = value.strip()
        if len(normalized) >= 2 and normalized[0] == normalized[-1] and normalized[0] in "\"'":
            normalized = normalized[1:-1]
        values[key.strip()] = normalized
    return values


def normalize_origin(value: str) -> str:
    try:
        parsed = urlsplit(value.strip())
        parsed.port
    except ValueError as error:
        raise ValueError("origin is not a valid URL") from error
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        raise ValueError("origin must use HTTP or HTTPS and include a host")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("origin must not contain user information")
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise ValueError("origin must not include a path, query, or fragment")
    return f"{parsed.scheme.lower()}://{parsed.netloc}"


def random_password() -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(48))


def render_candidate(
    source_lines: list[str],
    source_values: dict[str, str],
    *,
    origin: str,
    docker_socket: Path,
) -> str:
    missing = sorted(
        key for key in PRESERVED_REQUIRED_KEYS if not source_values.get(key, "").strip()
    )
    if missing:
        raise ValueError("active env is missing required keys: " + ", ".join(missing))
    socket_stat = docker_socket.stat()
    generated = {
        "QJUDGE_PUBLIC_ORIGIN": normalize_origin(origin),
        "POSTGRES_ADMIN_PASSWORD": random_password(),
        "DB_PASSWORD": random_password(),
        "AI_DB_PASSWORD": random_password(),
        "CREDENTIAL_LEASE_SECRET": secrets.token_urlsafe(48),
        "DOCKER_GID": str(socket_stat.st_gid),
        "DOCKER_SOCKET_UID": str(socket_stat.st_uid),
    }
    retained_lines: list[str] = []
    for raw_line in source_lines:
        stripped = raw_line.strip()
        key = stripped.split("=", 1)[0].strip() if "=" in stripped else ""
        if key not in ROTATED_KEYS:
            retained_lines.append(raw_line.rstrip("\n"))
    while retained_lines and not retained_lines[-1]:
        retained_lines.pop()
    retained_lines.extend(
        [
            "",
            "# Prepared release boundary. This file is inactive until explicitly promoted.",
            *(f"{key}={value}" for key, value in generated.items()),
            "",
        ]
    )
    return "\n".join(retained_lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=Path(".env"))
    parser.add_argument("--output", type=Path, default=Path(".env.next"))
    parser.add_argument("--origin")
    parser.add_argument(
        "--docker-socket", type=Path, default=Path("/var/run/docker.sock")
    )
    args = parser.parse_args()

    if args.output.exists():
        raise SystemExit(f"Refusing to overwrite existing candidate: {args.output}")
    source_lines = args.input.read_text().splitlines(keepends=True)
    source_values = parse_env(source_lines)
    origin = args.origin or source_values.get("QJUDGE_PUBLIC_ORIGIN") or source_values.get(
        "FRONTEND_URL", ""
    )
    if not origin:
        raise SystemExit("--origin is required when the active env has no public origin")
    try:
        content = render_candidate(
            source_lines,
            source_values,
            origin=origin,
            docker_socket=args.docker_socket,
        )
    except (OSError, ValueError) as error:
        raise SystemExit(str(error)) from error

    descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w") as stream:
            stream.write(content)
        args.output.chmod(0o600)
    except BaseException:
        args.output.unlink(missing_ok=True)
        raise
    print(f"Release environment candidate ready: {args.output}")


if __name__ == "__main__":
    main()
