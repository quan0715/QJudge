"""Resident process credentials are mounted files, independently rotatable."""
import os
from dataclasses import dataclass
from pathlib import Path

from integrity_service.worker.auth import load_public_key


@dataclass(frozen=True)
class ResidentSettings:
    root: Path
    backend_url: str
    credential_file: Path
    public_key_file: Path
    max_runs: int = 256
    receipt_workers: int = 4
    decision_workers: int = 2
    delivery_workers: int = 2
    control_workers: int = 2
    archive_workers: int = 1
    max_body_bytes: int = 1024 * 1024
    max_run_bytes: int = 1024 * 1024 * 1024
    max_pending_receipts: int = 10000
    process_batch_size: int = 32
    maintenance_interval: float = 1.0

    def __post_init__(self):
        for name in ("max_runs", "receipt_workers", "decision_workers", "delivery_workers", "control_workers", "archive_workers", "max_body_bytes", "max_run_bytes", "max_pending_receipts", "process_batch_size"):
            if type(getattr(self, name)) is not int or getattr(self, name) < 1:
                raise ValueError(f"invalid resident setting: {name}")
        if self.maintenance_interval <= 0:
            raise ValueError("invalid maintenance interval")

    @classmethod
    def from_environment(cls):
        return cls(root=Path(os.environ.get("INTEGRITY_RESIDENT_DATA_ROOT", "/run-data")),
                   backend_url=os.environ["BACKEND_INTERNAL_URL"],
                   credential_file=Path(os.environ.get("INTEGRITY_RESIDENT_SERVICE_TOKEN_FILE", "/run-secrets/resident-service-token")),
                   public_key_file=Path(os.environ.get("INTEGRITY_RESIDENT_PUBLIC_KEY_FILE", "/run-secrets/backend-public-key")))

    def read_credential(self):
        value = self.credential_file.read_text().strip()
        if not value or any(c.isspace() for c in value) or not value.isascii():
            raise ValueError("invalid resident service credential")
        return value

    def read_public_key(self):
        return load_public_key(self.public_key_file.read_text().strip())
