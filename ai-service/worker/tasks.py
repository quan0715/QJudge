"""Synchronous Celery entrypoints for the asynchronous AI workflow."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from contextvars import ContextVar
from typing import Any
from uuid import UUID

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from application.artifacts import ArtifactService
from config import get_settings
from domain.models import Artifact, Principal
from domain.ports import TraceContext
from infrastructure.agent.deepagent_adapter import (
    DeepAgentAdapter,
    McpToolConnectionProvider,
)
from infrastructure.artifacts.s3_artifact_store import (
    S3ArtifactStore,
    SqlAlchemyArtifactRepository,
)
from infrastructure.checkpoints.langgraph_store import LangGraphCheckpointStore
from infrastructure.database.base import async_session_factory
from infrastructure.mcp.credential_lease import RedisCredentialLeaseStore
from infrastructure.mcp.preflight import McpPreflight
from infrastructure.mcp.token_exchange import McpTokenExchangeClient
from infrastructure.queue.celery_dispatcher import CeleryRunDispatcher
from services.deepagent_runner import DeepAgentRunner

from .celery_app import celery_app
from .runtime import (
    SqlAlchemyWorkerRunStore,
    WorkerCredentialResolver,
    WorkerRuntime,
)
from .scheduler import WorkerScheduler


class _WorkerArtifactRepository:
    """Give each artifact operation a short, explicit DB transaction."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        self._session_factory = session_factory
        self._active: ContextVar[SqlAlchemyArtifactRepository | None] = (
            ContextVar("worker_artifact_repository", default=None)
        )

    @asynccontextmanager
    async def atomic_write(self) -> AsyncIterator[None]:
        if self._active.get() is not None:
            raise RuntimeError("Nested artifact transactions are unsupported")
        async with self._session_factory.begin() as session:
            token = self._active.set(SqlAlchemyArtifactRepository(session))
            try:
                yield
            finally:
                self._active.reset(token)

    async def _read(self, method: str, *args, **kwargs):
        async with self._session_factory() as session:
            repository = SqlAlchemyArtifactRepository(session)
            return await getattr(repository, method)(*args, **kwargs)

    async def session_exists(self, session_id: UUID) -> bool:
        return await self._read("session_exists", session_id)

    async def session_belongs_to(
        self, principal: Principal, session_id: UUID
    ) -> bool:
        return await self._read("session_belongs_to", principal, session_id)

    async def run_belongs_to_session(
        self, run_id: UUID, session_id: UUID
    ) -> bool:
        return await self._read("run_belongs_to_session", run_id, session_id)

    async def upsert(self, artifact: Artifact) -> Artifact:
        repository = self._active.get()
        if repository is None:
            raise RuntimeError("Artifact upsert requires atomic_write")
        return await repository.upsert(artifact)

    async def list_for_owner(
        self,
        principal: Principal,
        session_id: UUID,
        *,
        step: str | None = None,
        filename: str | None = None,
    ) -> list[Artifact]:
        return await self._read(
            "list_for_owner",
            principal,
            session_id,
            step=step,
            filename=filename,
        )

    async def list_for_session(
        self,
        session_id: UUID,
        *,
        step: str | None = None,
        filename: str | None = None,
    ) -> list[Artifact]:
        return await self._read(
            "list_for_session",
            session_id,
            step=step,
            filename=filename,
        )

    async def get_for_owner(
        self, principal: Principal, artifact_id: UUID
    ) -> Artifact | None:
        return await self._read("get_for_owner", principal, artifact_id)

    async def get_for_session(
        self, session_id: UUID, artifact_id: UUID
    ) -> Artifact | None:
        return await self._read("get_for_session", session_id, artifact_id)


def _trace_context(payload: dict[str, Any] | None) -> TraceContext:
    payload = payload or {}
    return TraceContext(
        request_id=payload.get("request_id"),
        traceparent=payload.get("traceparent"),
    )


def _redis_lease_store(redis: Redis) -> RedisCredentialLeaseStore:
    settings = get_settings()
    return RedisCredentialLeaseStore(
        redis,
        secret=settings.credential_lease_secret,
        mcp_server_id=settings.mcp_server_id,
    )


def _credentials(
    lease_store: RedisCredentialLeaseStore,
) -> WorkerCredentialResolver:
    settings = get_settings()
    return WorkerCredentialResolver(
        lease_store,
        McpTokenExchangeClient(settings.mcp_token_exchange_url),
        McpPreflight(settings.qjudge_mcp_url),
    )


def _artifact_store() -> S3ArtifactStore:
    settings = get_settings()
    return S3ArtifactStore(
        bucket=settings.artifact_s3_bucket,
        endpoint_url=settings.artifact_storage_endpoint_url,
        public_endpoint_url=settings.artifact_storage_public_endpoint_url,
        region=settings.artifact_storage_region,
        access_key=settings.artifact_storage_access_key,
        secret_key=settings.artifact_storage_secret_key,
        presign_ttl_seconds=settings.artifact_presigned_url_ttl_seconds,
        auto_create_bucket=settings.artifact_storage_auto_create_bucket,
    )


async def _execute_run(
    run_id: UUID,
    credential_lease_key: str | None,
    trace_context: TraceContext,
) -> None:
    settings = get_settings()
    session_factory = async_session_factory()
    engine = session_factory.kw["bind"]
    redis = Redis.from_url(settings.ai_redis_url, decode_responses=False)
    lease_store = _redis_lease_store(redis)
    credentials = _credentials(lease_store)
    checkpoints = LangGraphCheckpointStore(database_url=settings.ai_database_url)
    runner = DeepAgentRunner(
        mcp_server_url=settings.qjudge_mcp_url,
        skills_paths=settings.deepagent_skills_paths,
        memory_paths=settings.deepagent_memory_paths,
        checkpoint_store=checkpoints,
    )
    try:
        await runner.setup()
        artifacts = ArtifactService(
            _WorkerArtifactRepository(session_factory),
            _artifact_store(),
            max_bytes=settings.artifact_max_bytes,
        )
        agent = DeepAgentAdapter(
            runner=runner,
            mcp_provider=McpToolConnectionProvider(
                server_url=settings.qjudge_mcp_url
            ),
            artifact_service=artifacts,
            checkpoint_store=checkpoints,
        )
        runs = SqlAlchemyWorkerRunStore(
            session_factory,
            CeleryRunDispatcher(celery_app),
        )
        runtime = WorkerRuntime(
            runs,
            credentials,
            agent,
            checkpoints,
            heartbeat_seconds=settings.run_heartbeat_seconds,
        )
        await runtime.execute(
            run_id,
            credential_lease_key,
            trace_context,
        )
    finally:
        await runner.shutdown()
        await redis.aclose()
        await engine.dispose()


async def _scheduler() -> tuple[
    WorkerScheduler,
    LangGraphCheckpointStore,
    Redis,
    Any,
]:
    settings = get_settings()
    session_factory = async_session_factory()
    engine = session_factory.kw["bind"]
    redis = Redis.from_url(settings.ai_redis_url, decode_responses=False)
    lease_store = _redis_lease_store(redis)
    checkpoints = LangGraphCheckpointStore(database_url=settings.ai_database_url)
    await checkpoints.setup()
    runs = SqlAlchemyWorkerRunStore(
        session_factory,
        CeleryRunDispatcher(celery_app),
    )
    return (
        WorkerScheduler(
            runs,
            checkpoints,
            _credentials(lease_store),
            stale_after_seconds=settings.stale_run_seconds,
        ),
        checkpoints,
        redis,
        engine,
    )


async def _recover_stale_runs() -> int:
    scheduler, checkpoints, redis, engine = await _scheduler()
    try:
        return await scheduler.recover_stale_runs()
    finally:
        await checkpoints.close()
        await redis.aclose()
        await engine.dispose()


async def _dispatch_unblocked_sessions() -> int:
    scheduler, checkpoints, redis, engine = await _scheduler()
    try:
        return await scheduler.dispatch_unblocked_sessions()
    finally:
        await checkpoints.close()
        await redis.aclose()
        await engine.dispose()


@celery_app.task(name="ai.execute_run")
def execute_run(
    run_id: str,
    credential_lease_key: str | None = None,
    trace_context: dict[str, Any] | None = None,
) -> None:
    asyncio.run(
        _execute_run(
            UUID(run_id),
            credential_lease_key,
            _trace_context(trace_context),
        )
    )


@celery_app.task(name="ai.recover_stale_runs")
def recover_stale_runs() -> int:
    return asyncio.run(_recover_stale_runs())


@celery_app.task(name="ai.dispatch_unblocked_sessions")
def dispatch_unblocked_sessions() -> int:
    return asyncio.run(_dispatch_unblocked_sessions())
