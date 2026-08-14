"""Strict, narrow HTTP schemas for Docker lifecycle operations."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class StrictControllerModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, from_attributes=True)


class StartRunRequest(StrictControllerModel):
    run_token: str = Field(min_length=1, max_length=4096, strict=True)
    worker_image: str = Field(min_length=1, max_length=255, strict=True)


class EmptyLifecycleRequest(StrictControllerModel):
    pass


class StartRunResponse(StrictControllerModel):
    container_id: str
    container_name: str
    worker_url: str
    image_digest: str
    state: Literal["running"]
    run_token_sha256: str


class StopRunResponse(StrictControllerModel):
    run_id: UUID
    state: Literal["absent", "stopped"]


class DestroyRunResponse(StrictControllerModel):
    run_id: UUID
    destroyed: bool
    data_volume_retained: Literal[True]


class PurgeDataResponse(StrictControllerModel):
    run_id: UUID
    data_purged: bool


class RunStatusResponse(StrictControllerModel):
    run_id: UUID
    exists: bool
    state: Literal["absent", "created", "running", "stopping", "stopped", "exited"]
    container_id: str = ""
    container_name: str = ""
    worker_url: str = ""
    image_digest: str = ""
    run_token_sha256: str = ""
