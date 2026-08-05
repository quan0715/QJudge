"""Real PostgreSQL coverage for AI-owned artifact metadata."""

from __future__ import annotations

import hashlib
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from sqlalchemy import inspect, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from application.artifacts import ArtifactService, artifact_object_key
from domain.models import Artifact, Principal
from infrastructure.artifacts.s3_artifact_store import (
    ArtifactStorageError,
    SqlAlchemyArtifactRepository,
)
from infrastructure.database.models import ArtifactRow, RunRow, SessionRow
from services.artifact_tools import build_artifact_tools


class FailableArtifactStore:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.fail_put = False

    async def put(self, key: str, content: bytes, content_type: str) -> None:
        del content_type
        if self.fail_put:
            raise ArtifactStorageError("Failed to upload artifact")
        self.objects[key] = content

    async def get(self, key: str) -> bytes:
        return self.objects[key]

    async def presign(self, key: str) -> str:
        return f"https://objects.example/{key}"


def _artifact_write_tool(*, session_id: UUID, service: ArtifactService):
    return next(
        tool
        for tool in build_artifact_tools(
            session_id=session_id,
            run_id=None,
            artifact_service=service,
        )
        if tool.name == "artifact_write"
    )


@pytest.fixture
def principal_a() -> Principal:
    return Principal(issuer="issuer", subject="owner-a")


@pytest.fixture
def principal_b() -> Principal:
    return Principal(issuer="issuer", subject="owner-b")


@pytest_asyncio.fixture
async def db_session(db_engine):
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory.begin() as session:
        yield session


async def test_repository_upsert_preserves_id_and_scopes_reads_to_owner(
    db_session: AsyncSession,
    principal_a: Principal,
    principal_b: Principal,
) -> None:
    session_id = uuid4()
    db_session.add(
        SessionRow(
            session_id=session_id,
            owner_issuer=principal_a.issuer,
            owner_subject=principal_a.subject,
            title="Chat",
            context={},
        )
    )
    await db_session.flush()
    repository = SqlAlchemyArtifactRepository(db_session)

    first = await repository.upsert(
        Artifact(
            id=uuid4(),
            session_id=session_id,
            produced_by_run_id=None,
            step="rubric",
            filename="rubric.json",
            content_type="application/json",
            size_bytes=2,
            checksum="first",
            metadata={"version": 1},
        )
    )
    second = await repository.upsert(
        Artifact(
            id=uuid4(),
            session_id=session_id,
            produced_by_run_id=None,
            step="rubric",
            filename="rubric.json",
            content_type="application/json",
            size_bytes=3,
            checksum="second",
            metadata={"version": 2},
        )
    )

    assert second.id == first.id
    assert second.checksum == "second"
    assert await repository.get_for_owner(principal_a, first.id) == second
    assert await repository.get_for_owner(principal_b, first.id) is None

    connection = await db_session.connection()
    columns = await connection.run_sync(
        lambda sync_connection: {
            column["name"]
            for column in inspect(sync_connection).get_columns("artifacts", schema="ai")
        }
    )
    assert "object_key" not in columns


async def test_repository_rejects_producing_run_from_another_session(
    db_session: AsyncSession,
    principal_a: Principal,
) -> None:
    session_id = uuid4()
    other_session_id = uuid4()
    run_id = uuid4()
    db_session.add_all(
        [
            SessionRow(
                session_id=value,
                owner_issuer=principal_a.issuer,
                owner_subject=principal_a.subject,
                title="Chat",
                context={},
            )
            for value in (session_id, other_session_id)
        ]
    )
    await db_session.flush()
    db_session.add(
        RunRow(
            run_id=run_id,
            session_id=other_session_id,
            status="running",
            kind="chat",
            model_id="test-model",
            idempotency_key="foreign-run",
        )
    )
    await db_session.flush()
    repository = SqlAlchemyArtifactRepository(db_session)

    assert not await repository.run_belongs_to_session(run_id, session_id)
    assert await repository.run_belongs_to_session(run_id, other_session_id)


async def test_upsert_is_unique_by_session_step_and_filename(
    db_session: AsyncSession,
    principal_a: Principal,
) -> None:
    session_id = uuid4()
    db_session.add(
        SessionRow(
            session_id=session_id,
            owner_issuer=principal_a.issuer,
            owner_subject=principal_a.subject,
            title="Chat",
            context={},
        )
    )
    await db_session.flush()
    repository = SqlAlchemyArtifactRepository(db_session)

    for checksum in ("one", "two"):
        await repository.upsert(
            Artifact(
                id=uuid4(),
                session_id=session_id,
                produced_by_run_id=None,
                step="result",
                filename="result.csv",
                content_type="text/csv",
                checksum=checksum,
            )
        )

    count = await db_session.scalar(text("SELECT count(*) FROM ai.artifacts"))
    assert count == 1


async def test_failed_first_object_write_cannot_commit_artifact_metadata(
    db_engine,
    principal_a: Principal,
) -> None:
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    session_id = uuid4()
    async with factory.begin() as session:
        session.add(
            SessionRow(
                session_id=session_id,
                owner_issuer=principal_a.issuer,
                owner_subject=principal_a.subject,
                title="Chat",
                context={},
            )
        )

    store = FailableArtifactStore()
    store.fail_put = True
    async with factory.begin() as session:
        service = ArtifactService(
            SqlAlchemyArtifactRepository(session), store, max_bytes=1024
        )
        result = await _artifact_write_tool(
            session_id=session_id, service=service
        ).coroutine(
            step="result",
            filename="result.txt",
            content="new bytes",
            content_type="text/plain",
        )
        assert result == {
            "is_error": True,
            "detail": "Failed to upload artifact",
        }

    async with factory() as session:
        assert await session.scalar(select(ArtifactRow)) is None


async def test_failed_overwrite_keeps_committed_metadata_matching_old_bytes(
    db_engine,
    principal_a: Principal,
) -> None:
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    session_id = uuid4()
    store = FailableArtifactStore()
    async with factory.begin() as session:
        session.add(
            SessionRow(
                session_id=session_id,
                owner_issuer=principal_a.issuer,
                owner_subject=principal_a.subject,
                title="Chat",
                context={},
            )
        )
        await session.flush()
        service = ArtifactService(
            SqlAlchemyArtifactRepository(session), store, max_bytes=1024
        )
        original = await service.put_for_run(
            session_id=session_id,
            run_id=None,
            step="result",
            filename="result.txt",
            content=b"old bytes",
            content_type="text/plain",
            metadata={"version": 1},
        )

    store.fail_put = True
    async with factory.begin() as session:
        service = ArtifactService(
            SqlAlchemyArtifactRepository(session), store, max_bytes=1024
        )
        result = await _artifact_write_tool(
            session_id=session_id, service=service
        ).coroutine(
            step="result",
            filename="result.txt",
            content="new bytes",
            content_type="application/json",
            metadata={"version": 2},
        )
        assert result["is_error"] is True

    key = artifact_object_key(session_id, original.id)
    assert store.objects[key] == b"old bytes"
    async with factory() as session:
        row = await session.scalar(
            select(ArtifactRow).where(ArtifactRow.artifact_id == original.id)
        )
        assert row is not None
        assert row.content_type == "text/plain"
        assert row.size_bytes == len(b"old bytes")
        assert row.checksum == hashlib.sha256(b"old bytes").hexdigest()
        assert row.metadata_ == {"version": 1}
