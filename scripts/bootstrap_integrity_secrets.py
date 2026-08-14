#!/usr/bin/env python3
"""Create missing local-only credentials required by the Integrity services.

Existing regular files are validated and retained.  Refusing directories is
intentional: Docker creates a directory for a missing bind-mount source, and
silently replacing it could conceal an incorrect deployment setup.
"""

from __future__ import annotations

import argparse
import os
import secrets
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SECRETS_DIR = REPO_ROOT / "secrets" / "integrity"


def _write_new_file(path: Path, value: bytes) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(value)
    path.chmod(0o600)


def _ensure_controller_token(path: Path) -> str:
    if path.exists():
        if not path.is_file():
            raise RuntimeError(
                f"{path} must be a regular file; remove the empty bind-mount directory first"
            )
        token = path.read_bytes()
        if len(token) < 32 or token.strip() != token:
            raise RuntimeError(f"{path} must contain a non-whitespace controller token")
        return "retained"
    _write_new_file(path, secrets.token_urlsafe(48).encode("ascii"))
    return "created"


def _ensure_signing_key(path: Path) -> str:
    if path.exists():
        if not path.is_file():
            raise RuntimeError(
                f"{path} must be a regular file; remove the empty bind-mount directory first"
            )
        try:
            key = serialization.load_pem_private_key(path.read_bytes(), password=None)
        except ValueError as error:
            raise RuntimeError(f"{path} must contain an Ed25519 PEM private key") from error
        if not isinstance(key, Ed25519PrivateKey):
            raise RuntimeError(f"{path} must contain an Ed25519 PEM private key")
        return "retained"
    key = Ed25519PrivateKey.generate()
    _write_new_file(
        path,
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ),
    )
    return "created"


def bootstrap(secrets_dir: Path) -> dict[str, str]:
    secrets_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    return {
        "controller-token": _ensure_controller_token(secrets_dir / "controller-token"),
        "integrity-worker-signing-key": _ensure_signing_key(
            secrets_dir / "integrity-worker-signing-key"
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--secrets-dir", type=Path, default=DEFAULT_SECRETS_DIR)
    args = parser.parse_args()
    result = bootstrap(args.secrets_dir)
    print("Integrity dev secrets: " + ", ".join(
        f"{name} {status}" for name, status in result.items()
    ))


if __name__ == "__main__":
    main()
