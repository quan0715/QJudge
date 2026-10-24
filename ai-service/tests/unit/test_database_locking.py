"""Query boundary regressions: metadata writers must coexist with artifact FKs."""
from contextlib import asynccontextmanager
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from infrastructure.database.repositories import SqlAlchemyRunRepository
from worker.runtime import SqlAlchemyWorkerRunStore


class RecordingSession:
    def __init__(self, results):
        self.results = iter(results)
        self.queries = []

    async def scalar(self, statement):
        self.queries.append(str(statement.compile(dialect=postgresql.dialect())))
        return next(self.results)


class SessionFactory:
    def __init__(self, session):
        self.session = session

    @asynccontextmanager
    async def begin(self):
        yield self.session


@pytest.mark.asyncio
async def test_worker_event_locks_allow_foreign_key_checks_without_losing_exclusion():
    session = RecordingSession([uuid4(), None, None])
    store = SqlAlchemyWorkerRunStore(SessionFactory(session), None)

    assert await store.append_event(uuid4(), 1, {"type": "run_completed"}) is False

    locking_queries = session.queries[1:]
    assert len(locking_queries) == 2
    assert all("FOR NO KEY UPDATE" in query for query in locking_queries)


@pytest.mark.asyncio
async def test_event_repository_does_not_upgrade_worker_lock_and_block_artifacts():
    session = RecordingSession([None])
    with pytest.raises(LookupError):
        await SqlAlchemyRunRepository(session).append_event(
            uuid4(), {"type": "run_completed"}
        )

    assert "FOR NO KEY UPDATE" in session.queries[0]
