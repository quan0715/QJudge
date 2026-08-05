"""Application-level artifact ownership and storage-key behavior."""

from __future__ import annotations

from dataclasses import replace
from uuid import UUID, uuid4

import pytest

from application.artifacts import ArtifactNotFound, ArtifactService
from domain.models import Artifact, Principal, Session


class FakeArtifactRepository:
    def __init__(self, sessions: list[Session]) -> None:
        self.sessions = {session.id: session for session in sessions}
        self.artifacts: dict[UUID, Artifact] = {}
        self.run_sessions: dict[UUID, UUID] = {}

    async def session_exists(self, session_id: UUID) -> bool:
        return session_id in self.sessions

    async def session_belongs_to(self, principal: Principal, session_id: UUID) -> bool:
        session = self.sessions.get(session_id)
        return session is not None and session.owner == principal

    async def run_belongs_to_session(self, run_id: UUID, session_id: UUID) -> bool:
        return self.run_sessions.get(run_id) == session_id

    async def upsert(self, artifact: Artifact) -> Artifact:
        existing = next(
            (
                value
                for value in self.artifacts.values()
                if (value.session_id, value.step, value.filename)
                == (artifact.session_id, artifact.step, artifact.filename)
            ),
            None,
        )
        if existing is not None:
            artifact = replace(artifact, id=existing.id, created_at=existing.created_at)
        self.artifacts[artifact.id] = artifact
        return artifact

    async def list_for_owner(self, principal, session_id, *, step=None, filename=None):
        if not await self.session_belongs_to(principal, session_id):
            return []
        return await self.list_for_session(session_id, step=step, filename=filename)

    async def list_for_session(self, session_id, *, step=None, filename=None):
        return [
            artifact
            for artifact in self.artifacts.values()
            if artifact.session_id == session_id
            and (step is None or artifact.step == step)
            and (filename is None or artifact.filename == filename)
        ]

    async def get_for_owner(self, principal, artifact_id):
        artifact = self.artifacts.get(artifact_id)
        if artifact is None:
            return None
        return artifact if await self.session_belongs_to(principal, artifact.session_id) else None

    async def get_for_session(self, session_id, artifact_id):
        artifact = self.artifacts.get(artifact_id)
        return artifact if artifact is not None and artifact.session_id == session_id else None


class FakeArtifactStore:
    def __init__(self) -> None:
        self.keys: list[str] = []
        self.objects: dict[str, bytes] = {}

    async def put(self, key: str, content: bytes, content_type: str) -> None:
        self.keys.append(key)
        self.objects[key] = content

    async def get(self, key: str) -> bytes:
        return self.objects[key]

    async def presign(self, key: str) -> str:
        return f"https://objects.example/{key}"


@pytest.fixture
def principal() -> Principal:
    return Principal(issuer="issuer", subject="owner")


@pytest.fixture
def principal_b() -> Principal:
    return Principal(issuer="issuer", subject="other")


@pytest.fixture
def session(principal: Principal) -> Session:
    return Session(id=uuid4(), owner=principal, title="Chat", context={})


@pytest.fixture
def artifact_service(session: Session):
    repository = FakeArtifactRepository([session])
    store = FakeArtifactStore()
    service = ArtifactService(repository, store, max_bytes=1024)
    return service


async def test_put_derives_object_key_from_only_session_and_artifact_id(
    artifact_service: ArtifactService,
    principal: Principal,
    session: Session,
) -> None:
    artifact = await artifact_service.put(
        principal=principal,
        session_id=session.id,
        produced_by_run_id=None,
        step="rubric",
        filename="rubric.json",
        content=b"{}",
        content_type="application/json",
        metadata={},
    )

    assert artifact_service.store.keys == [
        f"ai-artifacts/{session.id}/{artifact.id}"
    ]


async def test_other_owner_cannot_download_artifact(
    artifact_service: ArtifactService,
    principal: Principal,
    principal_b: Principal,
    session: Session,
) -> None:
    artifact = await artifact_service.put(
        principal=principal,
        session_id=session.id,
        produced_by_run_id=None,
        step="rubric",
        filename="rubric.json",
        content=b"{}",
        content_type="application/json",
        metadata={},
    )

    with pytest.raises(ArtifactNotFound):
        await artifact_service.get_content(principal_b, artifact.id)


async def test_upsert_preserves_artifact_id_and_replaces_content(
    artifact_service: ArtifactService,
    principal: Principal,
    session: Session,
) -> None:
    first = await artifact_service.put(
        principal, session.id, None, "rubric", "rubric.json", b"one", "text/plain", {}
    )
    second = await artifact_service.put(
        principal, session.id, None, "rubric", "rubric.json", b"two", "text/plain", {}
    )

    assert second.id == first.id
    assert artifact_service.store.keys[-1] == f"ai-artifacts/{session.id}/{first.id}"
    assert await artifact_service.get_content(principal, first.id) == b"two"


async def test_producing_run_must_belong_to_artifact_session(
    artifact_service: ArtifactService,
    principal: Principal,
    session: Session,
) -> None:
    foreign_run = uuid4()

    with pytest.raises(ArtifactNotFound):
        await artifact_service.put(
            principal,
            session.id,
            foreign_run,
            "rubric",
            "rubric.json",
            b"{}",
            "application/json",
            {},
        )
