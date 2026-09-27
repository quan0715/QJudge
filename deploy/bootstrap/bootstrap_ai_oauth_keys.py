#!/usr/bin/env python3
"""Create the Ed25519 key pair used for QJudge AI resource tokens."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def bootstrap(private_path: Path, public_path: Path) -> None:
    private_path.parent.mkdir(parents=True, exist_ok=True)
    public_path.parent.mkdir(parents=True, exist_ok=True)

    if private_path.exists():
        key = serialization.load_pem_private_key(
            private_path.read_bytes(), password=None
        )
        if not isinstance(key, Ed25519PrivateKey):
            raise ValueError("Existing private key is not Ed25519")
    else:
        key = Ed25519PrivateKey.generate()
        private_key_data = key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        descriptor = os.open(
            private_path,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            0o600,
        )
        with os.fdopen(descriptor, "wb") as private_file:
            private_file.write(private_key_data)
    os.chmod(private_path, 0o600)

    public_path.write_bytes(
        key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--private-key",
        type=Path,
        default=Path("secrets/ai-oauth-ed25519-private.pem"),
    )
    parser.add_argument(
        "--public-key",
        type=Path,
        default=Path("secrets/ai-oauth-ed25519-public.pem"),
    )
    args = parser.parse_args()
    bootstrap(args.private_key, args.public_key)


if __name__ == "__main__":
    main()
