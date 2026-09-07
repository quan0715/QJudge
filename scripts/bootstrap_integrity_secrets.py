#!/usr/bin/env python3
"""Create missing local-only credentials required by the Integrity services.

Existing regular files are validated and retained.  Refusing directories is
intentional: Docker creates a directory for a missing bind-mount source, and
silently replacing it could conceal an incorrect deployment setup.
"""

from __future__ import annotations

import argparse
import base64
import os
import secrets
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SECRETS_DIR = REPO_ROOT / "secrets" / "integrity"


def _write_new_file(path: Path, value: bytes) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(value)
    path.chmod(0o600)


def _ensure_controller_token(path: Path) -> str:
    if path.exists() or path.is_symlink():
        if path.is_symlink() or not path.is_file():
            raise RuntimeError(
                f"{path} must be a regular file; remove the empty bind-mount directory first"
            )
        token = path.read_bytes()
        if path.stat().st_mode & 0o007:
            raise RuntimeError(f"{path} must not grant permissions to other users")
        if len(token) < 32 or not token.isascii() or any(chr(c).isspace() for c in token):
            raise RuntimeError(f"{path} must contain a non-whitespace ASCII token")
        return "retained"
    _write_new_file(path, secrets.token_urlsafe(48).encode("ascii"))
    return "created"


def _ensure_signing_key(path: Path) -> str:
    if path.exists() or path.is_symlink():
        if path.is_symlink() or not path.is_file():
            raise RuntimeError(
                f"{path} must be a regular file; remove the empty bind-mount directory first"
            )
        try:
            key = serialization.load_pem_private_key(path.read_bytes(), password=None)
        except (ValueError, TypeError) as error:
            raise RuntimeError(f"{path} must contain an Ed25519 PEM private key") from error
        if not isinstance(key, Ed25519PrivateKey):
            raise RuntimeError(f"{path} must contain an Ed25519 PEM private key")
        if path.stat().st_mode & 0o007:
            raise RuntimeError(f"{path} must not grant permissions to other users")
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


def _ensure_public_key(path: Path, private_path: Path) -> str:
    private = serialization.load_pem_private_key(private_path.read_bytes(), password=None)
    expected = private.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw,
    )
    if path.exists() or path.is_symlink():
        if path.is_symlink() or not path.is_file():
            raise RuntimeError(f"{path} must be a regular file")
        try:
            encoded = base64.b64decode(path.read_bytes().strip(), validate=True)
            public = (Ed25519PublicKey.from_public_bytes(encoded) if len(encoded) == 32
                      else serialization.load_der_public_key(encoded))
            if not isinstance(public, Ed25519PublicKey):
                raise ValueError("not Ed25519")
            actual = public.public_bytes(
                serialization.Encoding.Raw, serialization.PublicFormat.Raw,
            )
        except (ValueError, TypeError) as error:
            raise RuntimeError(f"{path} must contain the matching Ed25519 public key") from error
        if actual != expected:
            raise RuntimeError(f"{path} does not match the existing signing private key")
        return "retained"
    _write_new_file(path, base64.b64encode(expected))
    return "created"


def bootstrap(secrets_dir: Path, resident_gid: int | None = None) -> dict[str, str]:
    if resident_gid is not None and resident_gid < 0:
        raise RuntimeError("resident gid must be nonnegative")
    secrets_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    result = {
        "controller-token": _ensure_controller_token(secrets_dir / "controller-token"),
        "integrity-worker-signing-key": _ensure_signing_key(
            secrets_dir / "integrity-worker-signing-key"
        ),
    }
    result["backend-public-key"] = _ensure_public_key(
        secrets_dir / "backend-public-key", secrets_dir / "integrity-worker-signing-key",
    )
    result["resident-service-token"] = _ensure_controller_token(secrets_dir / "resident-service-token")
    if (secrets_dir / "resident-service-token").read_bytes() == (secrets_dir / "controller-token").read_bytes():
        raise RuntimeError("resident service token must differ from controller token")
    if resident_gid is not None:
        # Only these individually mounted resident files gain group read access.
        # Preserve host ownership and all legacy credential metadata.
        for name in ("backend-public-key", "resident-service-token"):
            path = secrets_dir / name
            os.chown(path, -1, resident_gid)
            path.chmod(0o640)
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--secrets-dir", type=Path, default=DEFAULT_SECRETS_DIR)
    parser.add_argument("--resident-gid", type=int)
    args = parser.parse_args()
    try:
        result = bootstrap(args.secrets_dir, args.resident_gid)
    except (RuntimeError, OSError) as error:
        parser.exit(1, f"Integrity dev secrets: {error}\n")
    print("Integrity dev secrets: " + ", ".join(
        f"{name} {status}" for name, status in result.items()
    ))


if __name__ == "__main__":
    main()
