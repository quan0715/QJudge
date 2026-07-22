"""Validated process settings for the dedicated Docker Controller."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path


_NETWORK_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\Z")


@dataclass(frozen=True, slots=True)
class ControllerSettings:
    internal_token_file: Path
    allowed_worker_images: frozenset[str]
    backend_internal_url: str
    worker_network: str

    def __post_init__(self) -> None:
        if not isinstance(self.internal_token_file, Path):
            raise TypeError("internal_token_file must be a Path")
        if not self.internal_token_file.is_absolute():
            raise ValueError("internal_token_file must be absolute")
        if (
            not isinstance(self.allowed_worker_images, frozenset)
            or not self.allowed_worker_images
            or any(
                type(image) is not str
                or not image
                or image != image.strip()
                or len(image) > 255
                for image in self.allowed_worker_images
            )
        ):
            raise ValueError("allowed_worker_images must be a non-empty allowlist")
        if (
            type(self.backend_internal_url) is not str
            or not self.backend_internal_url
            or self.backend_internal_url != self.backend_internal_url.strip()
            or len(self.backend_internal_url) > 512
            or not self.backend_internal_url.startswith(("http://", "https://"))
        ):
            raise ValueError("backend_internal_url is invalid")
        if not _NETWORK_NAME.fullmatch(self.worker_network):
            raise ValueError("worker_network is invalid")

    @classmethod
    def from_environment(cls) -> "ControllerSettings":
        raw_images = os.environ.get(
            "INTEGRITY_WORKER_IMAGE_ALLOWLIST"
        ) or os.environ.get(
            "INTEGRITY_CONTROLLER_ALLOWED_WORKER_IMAGES",
            "oj-integrity-worker:latest",
        )
        images = frozenset(part.strip() for part in raw_images.split(",") if part.strip())
        return cls(
            internal_token_file=Path(
                os.environ.get(
                    "INTEGRITY_CONTROLLER_INTERNAL_TOKEN_FILE",
                    "/run-secrets/controller-token",
                )
            ),
            allowed_worker_images=images,
            backend_internal_url=os.environ.get(
                "BACKEND_INTERNAL_URL", "http://backend:8000"
            ).rstrip("/"),
            worker_network=os.environ.get(
                "INTEGRITY_WORKER_NETWORK", "qjudge-test-network"
            ),
        )

    def read_internal_token_bytes(self) -> bytes:
        try:
            token = self.internal_token_file.read_bytes()
        except OSError as error:
            raise RuntimeError("Controller credential is unavailable") from error
        if not token:
            raise RuntimeError("Controller credential is unavailable")
        return token
