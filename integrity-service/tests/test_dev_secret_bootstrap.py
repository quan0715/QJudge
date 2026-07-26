"""Regression coverage for local-only Integrity secret provisioning."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


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
    first_token = (secrets_dir / "controller-token").read_bytes()
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

    assert (secrets_dir / "controller-token").read_bytes() == first_token
