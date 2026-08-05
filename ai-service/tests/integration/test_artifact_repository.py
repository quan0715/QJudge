"""Real PostgreSQL coverage for AI-owned artifact metadata."""

from __future__ import annotations

from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from domain.models import Artifact, Principal
from infrastructure.artifacts.s3_artifact_store import SqlAlchemyArtifactRepository
from infrastructure.database.models import RunRow, SessionRow


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
