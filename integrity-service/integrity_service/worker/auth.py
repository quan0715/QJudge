"""Exact-byte Ed25519 verification for Backend-to-Worker requests."""

from __future__ import annotations

import base64
import binascii
from uuid import UUID

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


class RequestAuthenticationError(ValueError):
    """A private Worker request did not authenticate."""


def load_public_key(value_b64: str) -> Ed25519PublicKey:
    try:
        encoded = base64.b64decode(value_b64, validate=True)
        if len(encoded) == 32:
            return Ed25519PublicKey.from_public_bytes(encoded)
        key = serialization.load_der_public_key(encoded)
    except (ValueError, TypeError, binascii.Error) as error:
        raise ValueError("invalid Backend signing public key") from error
    if not isinstance(key, Ed25519PublicKey):
        raise ValueError("Backend signing key must be Ed25519")
    return key


def verify_resident_request(public_key, *, method, path, run_id, revision, protocol,
                            timestamp, header_run_id, signature_b64, body, now_seconds):
    """Domain-separated resident signature, deliberately incompatible with legacy."""
    if protocol != "resident-v1" or header_run_id != str(run_id):
        raise RequestAuthenticationError("invalid resident scope")
    if (not revision.isascii() or not revision.isdigit() or len(revision) > 20
            or int(revision) < 1 or str(int(revision)) != revision):
        raise RequestAuthenticationError("invalid revision")
    if (not timestamp.isascii() or not timestamp.isdigit() or len(timestamp) > 20
            or str(int(timestamp)) != timestamp or abs(now_seconds - int(timestamp)) > 30):
        raise RequestAuthenticationError("invalid timestamp")
    message = f"resident-v1\n{method}\n{path}\n{run_id}\n{revision}\n{timestamp}\n".encode("ascii") + body
    try:
        public_key.verify(base64.b64decode(signature_b64, validate=True), message)
    except (InvalidSignature, ValueError, binascii.Error) as error:
        raise RequestAuthenticationError("invalid signature") from error


def verify_backend_request(
    public_key: Ed25519PublicKey,
    *,
    body: bytes,
    timestamp: str,
    path_run_id: UUID,
    expected_run_id: UUID,
    header_run_id: str,
    signature_b64: str,
    now_seconds: int,
) -> None:
    try:
        signed_run_id = UUID(header_run_id)
    except (ValueError, AttributeError) as error:
        raise RequestAuthenticationError("invalid request authentication") from error
    if signed_run_id != path_run_id or path_run_id != expected_run_id:
        raise RequestAuthenticationError("invalid request authentication")
    if (
        not timestamp.isascii()
        or not timestamp.isdigit()
        or len(timestamp) > 20
    ):
        raise RequestAuthenticationError("invalid request authentication")
    try:
        timestamp_seconds = int(timestamp)
    except ValueError as error:
        raise RequestAuthenticationError("invalid request authentication") from error
    if timestamp != str(timestamp_seconds):
        raise RequestAuthenticationError("invalid request authentication")
    if abs(now_seconds - timestamp_seconds) > 30:
        raise RequestAuthenticationError("stale request authentication")
    try:
        signature = base64.b64decode(signature_b64, validate=True)
    except (ValueError, binascii.Error) as error:
        raise RequestAuthenticationError("invalid request authentication") from error
    message = (
        str(signed_run_id).encode("ascii")
        + b"\n"
        + timestamp.encode("ascii")
        + b"\n"
        + body
    )
    try:
        public_key.verify(signature, message)
    except (InvalidSignature, ValueError) as error:
        raise RequestAuthenticationError("invalid request authentication") from error
