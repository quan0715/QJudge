"""Artifact application service with owner-scoped and run-scoped operations."""

from __future__ import annotations

import hashlib
import re
from contextlib import AbstractAsyncContextManager
from typing import Any, Protocol
from uuid import UUID, uuid4

from domain.models import Artifact, Principal

_STEP_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_FILENAME_RE = re.compile(r"^[A-Za-z0-9._-]{1,255}$")


class ArtifactNotFound(LookupError):
    """Use not-found semantics for missing and foreign artifacts."""


class InvalidArtifact(ValueError):
    """Raised when artifact metadata or content violates the public contract."""


class ArtifactMetadataRepository(Protocol):
    def atomic_write(self) -> AbstractAsyncContextManager[None]: ...

    async def session_exists(self, session_id: UUID) -> bool: ...

    async def session_belongs_to(self, principal: Principal, session_id: UUID) -> bool: ...

    async def run_belongs_to_session(self, run_id: UUID, session_id: UUID) -> bool: ...

    async def upsert(self, artifact: Artifact) -> Artifact: ...

    async def list_for_owner(
        self,
        principal: Principal,
        session_id: UUID,
        *,
        step: str | None = None,
        filename: str | None = None,
    ) -> list[Artifact]: ...

    async def list_for_session(
        self,
        session_id: UUID,
        *,
        step: str | None = None,
        filename: str | None = None,
    ) -> list[Artifact]: ...

    async def get_for_owner(
        self, principal: Principal, artifact_id: UUID
    ) -> Artifact | None: ...

    async def get_for_session(
        self, session_id: UUID, artifact_id: UUID
    ) -> Artifact | None: ...


class ArtifactObjectStore(Protocol):
    async def put(self, key: str, content: bytes, content_type: str) -> None: ...

    async def get(self, key: str) -> bytes: ...

    async def presign(self, key: str) -> str: ...


def artifact_object_key(session_id: UUID, artifact_id: UUID) -> str:
    """Derive the storage key solely from stable AI-domain identifiers."""

    return f"ai-artifacts/{session_id}/{artifact_id}"


def artifact_to_payload(artifact: Artifact) -> dict[str, Any]:
    """Keep the established artifact tool payload while hiding storage keys."""

    return {
        "id": str(artifact.id),
        "session_id": str(artifact.session_id),
        "run_id": (
            str(artifact.produced_by_run_id)
            if artifact.produced_by_run_id is not None
            else None
        ),
        "step": artifact.step,
        "filename": artifact.filename,
        "object_key": artifact_object_key(artifact.session_id, artifact.id),
        "content_type": artifact.content_type,
        "size_bytes": artifact.size_bytes,
        "checksum": artifact.checksum,
        "metadata": dict(artifact.metadata),
        "created_at": (
            artifact.created_at.isoformat() if artifact.created_at is not None else None
        ),
        "updated_at": (
            artifact.updated_at.isoformat() if artifact.updated_at is not None else None
        ),
    }


class ArtifactService:
    def __init__(
        self,
        repository: ArtifactMetadataRepository,
        store: ArtifactObjectStore,
        *,
        max_bytes: int,
    ) -> None:
        self._repository = repository
        self._store = store
        self._max_bytes = max_bytes

    @property
    def store(self) -> ArtifactObjectStore:
        """Expose the injected port for deterministic contract tests."""

        return self._store

    async def put(
        self,
        principal: Principal,
        session_id: UUID,
        produced_by_run_id: UUID | None,
        step: str,
        filename: str,
        content: bytes,
        content_type: str,
        metadata: dict[str, Any],
    ) -> Artifact:
        if not await self._repository.session_belongs_to(principal, session_id):
            raise ArtifactNotFound(f"Session not found: {session_id}")
        return await self._put(
            session_id=session_id,
            produced_by_run_id=produced_by_run_id,
            step=step,
            filename=filename,
            content=content,
            content_type=content_type,
            metadata=metadata,
        )

    async def put_for_run(
        self,
        *,
        session_id: UUID,
        run_id: UUID | None,
        step: str,
        filename: str,
        content: bytes,
        content_type: str,
        metadata: dict[str, Any],
    ) -> Artifact:
        if not await self._repository.session_exists(session_id):
            raise ArtifactNotFound(f"Session not found: {session_id}")
        return await self._put(
            session_id=session_id,
            produced_by_run_id=run_id,
            step=step,
            filename=filename,
            content=content,
            content_type=content_type,
            metadata=metadata,
        )

    async def _put(
        self,
        *,
        session_id: UUID,
        produced_by_run_id: UUID | None,
        step: str,
        filename: str,
        content: bytes,
        content_type: str,
        metadata: dict[str, Any],
    ) -> Artifact:
        self._validate(step, filename, content, content_type)
        if produced_by_run_id is not None and not await self._repository.run_belongs_to_session(
            produced_by_run_id, session_id
        ):
            raise ArtifactNotFound(f"Run not found in session: {produced_by_run_id}")

        async with self._repository.atomic_write():
            artifact = await self._repository.upsert(
                Artifact(
                    id=uuid4(),
                    session_id=session_id,
                    produced_by_run_id=produced_by_run_id,
                    step=step,
                    filename=filename,
                    content_type=content_type,
                    size_bytes=len(content),
                    checksum=hashlib.sha256(content).hexdigest(),
                    metadata=dict(metadata),
                )
            )
            await self._store.put(
                artifact_object_key(artifact.session_id, artifact.id),
                content,
                content_type,
            )
        return artifact

    async def list(
        self,
        principal: Principal,
        session_id: UUID,
        *,
        step: str | None = None,
        filename: str | None = None,
    ) -> list[Artifact]:
        if not await self._repository.session_belongs_to(principal, session_id):
            raise ArtifactNotFound(f"Session not found: {session_id}")
        return await self._repository.list_for_owner(
            principal, session_id, step=step, filename=filename
        )

    async def list_for_run(
        self,
        session_id: UUID,
        *,
        step: str | None = None,
        filename: str | None = None,
    ) -> list[Artifact]:
        if not await self._repository.session_exists(session_id):
            raise ArtifactNotFound(f"Session not found: {session_id}")
        return await self._repository.list_for_session(
            session_id, step=step, filename=filename
        )

    async def get_content(self, principal: Principal, artifact_id: UUID) -> bytes:
        artifact = await self._repository.get_for_owner(principal, artifact_id)
        if artifact is None:
            raise ArtifactNotFound(f"Artifact not found: {artifact_id}")
        return await self._store.get(artifact_object_key(artifact.session_id, artifact.id))

    async def get_content_for_run(self, session_id: UUID, artifact_id: UUID) -> bytes:
        artifact = await self._repository.get_for_session(session_id, artifact_id)
        if artifact is None:
            raise ArtifactNotFound(f"Artifact not found: {artifact_id}")
        return await self._store.get(artifact_object_key(artifact.session_id, artifact.id))

    async def get_download_url(self, principal: Principal, artifact_id: UUID) -> str:
        artifact = await self._repository.get_for_owner(principal, artifact_id)
        if artifact is None:
            raise ArtifactNotFound(f"Artifact not found: {artifact_id}")
        return await self._store.presign(artifact_object_key(artifact.session_id, artifact.id))

    def _validate(
        self, step: str, filename: str, content: bytes, content_type: str
    ) -> None:
        if not _STEP_RE.fullmatch(step):
            raise InvalidArtifact("invalid step")
        if not _FILENAME_RE.fullmatch(filename):
            raise InvalidArtifact("invalid filename")
        if not content_type or len(content_type) > 100:
            raise InvalidArtifact("invalid content_type")
        if len(content) > self._max_bytes:
            raise InvalidArtifact(
                f"content exceeds artifact_max_bytes={self._max_bytes}"
            )
