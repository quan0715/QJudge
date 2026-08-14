from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPOSITORY_ROOT / "scripts" / "prepare-prod-release-env.py"


def _legacy_env() -> str:
    return """\
FRONTEND_URL=https://q-judge.com
SECRET_KEY=existing-production-secret
DB_PASSWORD=legacy-superuser-password
OBJECT_STORAGE_ENDPOINT_URL=https://storage.example.invalid
OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=https://storage.example.invalid
OBJECT_STORAGE_ACCESS_KEY=existing-storage-access
OBJECT_STORAGE_SECRET_KEY=existing-storage-secret
TUNNEL_TOKEN=existing-tunnel-token
"""


def _parse_env(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip()
    return result


def test_release_env_rotates_database_credentials_without_touching_active_env(
    tmp_path: Path,
) -> None:
    active = tmp_path / ".env"
    output = tmp_path / ".env.next"
    docker_socket = tmp_path / "docker.sock"
    active.write_text(_legacy_env())
    docker_socket.touch()

    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--input",
            str(active),
            "--output",
            str(output),
            "--origin",
            "https://q-judge.com/",
            "--docker-socket",
            str(docker_socket),
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert active.read_text() == _legacy_env()
    assert os.stat(output).st_mode & 0o777 == 0o600

    values = _parse_env(output)
    assert values["QJUDGE_PUBLIC_ORIGIN"] == "https://q-judge.com"
    assert values["SECRET_KEY"] == "existing-production-secret"
    assert values["TUNNEL_TOKEN"] == "existing-tunnel-token"
    assert values["DB_PASSWORD"] != "legacy-superuser-password"
    generated = {
        values["POSTGRES_ADMIN_PASSWORD"],
        values["DB_PASSWORD"],
        values["AI_DB_PASSWORD"],
        values["CREDENTIAL_LEASE_SECRET"],
    }
    assert len(generated) == 4
    assert all(len(value) >= 40 for value in generated)
    socket_stat = docker_socket.stat()
    assert values["DOCKER_GID"] == str(socket_stat.st_gid)
    assert values["DOCKER_SOCKET_UID"] == str(socket_stat.st_uid)


def test_release_env_refuses_to_replace_an_existing_candidate(tmp_path: Path) -> None:
    active = tmp_path / ".env"
    output = tmp_path / ".env.next"
    docker_socket = tmp_path / "docker.sock"
    active.write_text(_legacy_env())
    output.write_text("keep-me\n")
    docker_socket.touch()

    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--input",
            str(active),
            "--output",
            str(output),
            "--docker-socket",
            str(docker_socket),
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode != 0
    assert output.read_text() == "keep-me\n"
