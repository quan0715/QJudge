"""Regression coverage for local-only Integrity secret provisioning."""

from __future__ import annotations

import subprocess
import base64
import sys
import os
import stat
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
import pytest
from integrity_service.worker.auth import load_public_key


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_local_integrity_secrets_are_ignored() -> None:
    assert "secrets/" in (REPO_ROOT / ".gitignore").read_text()


def test_dev_secret_bootstrap_generates_usable_files_once(tmp_path: Path) -> None:
    script = REPO_ROOT / "scripts" / "bootstrap_integrity_secrets.py"
    secrets_dir = tmp_path / "integrity"

    assert script.is_file()
    subprocess.run(
        [sys.executable, str(script), "--secrets-dir", str(secrets_dir)],
        check=True,
        capture_output=True,
        text=True,
    )
    first_token = (secrets_dir / "resident-service-token").read_bytes()
    private_key = serialization.load_pem_private_key(
        (secrets_dir / "integrity-worker-signing-key").read_bytes(),
        password=None,
    )

    assert first_token.strip() == first_token
    assert len(first_token) >= 32
    assert isinstance(private_key, Ed25519PrivateKey)

    subprocess.run(
        [sys.executable, str(script), "--secrets-dir", str(secrets_dir)],
        check=True,
        capture_output=True,
        text=True,
    )

    assert (secrets_dir / "resident-service-token").read_bytes() == first_token


def run_bootstrap(directory, *args):
    return subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts/bootstrap_integrity_secrets.py"),
         "--secrets-dir", str(directory), *args], capture_output=True, text=True,
    )


def test_resident_credentials_match_signing_key_and_survive_repeated_bootstrap(tmp_path):
    assert run_bootstrap(tmp_path).returncode == 0
    public_file = tmp_path / "backend-public-key"
    assert public_file.is_file(), "resident public key was not derived"
    private_file = tmp_path / "integrity-worker-signing-key"
    private = serialization.load_pem_private_key(private_file.read_bytes(), password=None)
    public = load_public_key(public_file.read_text())
    public.verify(private.sign(b"descriptor"), b"descriptor")
    resident = (tmp_path / "resident-service-token").read_bytes()
    assert len(resident) >= 32
    assert resident.strip() == resident
    original = {p.name: (p.read_bytes(), p.stat().st_mode, p.stat().st_uid) for p in tmp_path.iterdir()}
    result = run_bootstrap(tmp_path)
    assert result.returncode == 0
    assert original == {p.name: (p.read_bytes(), p.stat().st_mode, p.stat().st_uid) for p in tmp_path.iterdir()}
    assert resident.decode() not in result.stdout + result.stderr


@pytest.mark.parametrize("filename,value", [
    ("backend-public-key", b"bad-key"),
    ("resident-service-token", b"x" * 32 + b" space"),
    ("resident-service-token", b"\xff" * 48),
])
def test_invalid_existing_resident_material_is_rejected_without_replacement(tmp_path, filename, value):
    path = tmp_path / filename
    path.write_bytes(value)
    path.chmod(0o600)
    assert run_bootstrap(tmp_path).returncode != 0
    assert path.read_bytes() == value


def test_mismatched_existing_public_key_is_rejected(tmp_path):
    public = base64.b64encode(Ed25519PrivateKey.generate().public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw))
    (tmp_path / "backend-public-key").write_bytes(public)
    assert run_bootstrap(tmp_path).returncode != 0
    assert (tmp_path / "backend-public-key").read_bytes() == public


def test_resident_group_access_preserves_legacy_secret_permissions(tmp_path):
    assert run_bootstrap(tmp_path).returncode == 0
    legacy = {name: (tmp_path / name).stat() for name in ("integrity-worker-signing-key",)}
    result = run_bootstrap(tmp_path, "--resident-gid", "10001")
    assert result.returncode == 0, result.stderr
    for name in ("backend-public-key", "resident-service-token"):
        metadata = (tmp_path / name).stat()
        assert metadata.st_gid == 10001
        assert stat.S_IMODE(metadata.st_mode) == 0o640
    for name, before in legacy.items():
        after = (tmp_path / name).stat()
        assert (before.st_mode, before.st_uid, before.st_gid) == (after.st_mode, after.st_uid, after.st_gid)


@pytest.mark.parametrize("filename", ["resident-service-token", "integrity-worker-signing-key"])
def test_world_readable_private_material_is_rejected_without_chmod(tmp_path, filename):
    assert run_bootstrap(tmp_path).returncode == 0
    path = tmp_path / filename
    path.chmod(0o644)
    assert run_bootstrap(tmp_path).returncode != 0
    assert stat.S_IMODE(path.stat().st_mode) == 0o644


def test_nonroot_resident_can_read_individual_mounts_and_write_its_volume(tmp_path):
    # Hard links model individual file binds without exposing the secret directory.
    for parent in (tmp_path, tmp_path.parent, tmp_path.parent.parent):
        parent.chmod(0o755)
    secrets_dir = tmp_path / "secrets"
    assert run_bootstrap(secrets_dir, "--resident-gid", "10001").returncode == 0
    mounts = tmp_path / "mounts"
    mounts.mkdir(mode=0o755)
    for name in ("backend-public-key", "resident-service-token"):
        os.link(secrets_dir / name, mounts / name)
    data = tmp_path / "data"
    data.mkdir(mode=0o700)
    os.chown(data, 10001, 10001)

    def drop_privileges():
        os.setgroups([])
        os.setgid(10001)
        os.setuid(10001)

    result = subprocess.run([sys.executable, "-c", """
import os, sys
from pathlib import Path
from integrity_service.resident.settings import ResidentSettings
mounts, root, private = map(Path, sys.argv[1:])
settings = ResidentSettings(root, 'http://backend:8000', mounts / 'resident-service-token', mounts / 'backend-public-key')
assert settings.read_credential()
assert settings.read_public_key()
(settings.root / 'probe').write_bytes(b'durable')
assert not os.access(private, os.R_OK)
""", str(mounts), str(data), str(secrets_dir / "integrity-worker-signing-key")],
        capture_output=True, text=True, preexec_fn=drop_privileges)
    assert result.returncode == 0, result.stderr
    assert (data / "probe").read_bytes() == b"durable"
