"""Canonical FastAPI entry point for the autonomous AI Service."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID, uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from jwt import PyJWKClient
from redis.asyncio import Redis
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from api.errors import install_error_handlers
from api.routers import (
    artifacts_router,
    health_router,
    runs_router,
    sessions_router,
    system_router,
)
from application.artifacts import ArtifactNotFound, ArtifactService
from application.credential_service import CredentialService, McpUnavailable
from application.run_service import (
    RunNotFound,
    RunService,
    reset_current_trace,
    set_current_trace,
)
from application.session_service import SessionService
from application.usage_service import UsageService
from config import Settings, get_settings
from domain.models import Principal, Run, RunKind, RunStatus, Usage
from domain.ports import TraceContext
from infrastructure.artifacts import S3ArtifactStore, SqlAlchemyArtifactRepository
from infrastructure.checkpoints.langgraph_store import LangGraphCheckpointStore
from infrastructure.database.base import create_async_engine_from_settings
from infrastructure.database.models import RunRow, SessionRow
from infrastructure.database.uow import SqlAlchemyUnitOfWork
from infrastructure.mcp.credential_lease import RedisCredentialLeaseStore
from infrastructure.mcp.token_exchange import McpTokenExchangeClient
from infrastructure.oauth.jwt_verifier import AuthError, JwtVerifier
from infrastructure.queue import CeleryRunDispatcher
from worker.celery_app import celery_app

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class _RejectingVerifier:
    def verify(self, token: str, audience: str, required_scopes: frozenset[str]):
        del token, audience, required_scopes
        raise AuthError("AI_AUTH_INVALID", "OAuth verifier is not configured")


class _UnavailableCredentials:
    async def ensure_ready(self, principal: Principal, subject_token: str):
        del principal, subject_token
        raise McpUnavailable("MCP credential lease is not configured")


class _UnavailableCheckpoints:
    async def delete_session(self, session_id: UUID) -> None:
        del session_id
        raise RuntimeError("AI checkpoint database is not configured")


class _PersistedEventReader:
    def __init__(self, uow_factory) -> None:
        self._uow_factory = uow_factory

    async def get_run(self, principal: Principal, run_id: UUID) -> Run:
        async with self._uow_factory() as uow:
            run = await uow.runs.get_for_owner(principal, run_id)
        if run is None:
            raise RunNotFound(run_id)
        return run

    async def list_after(self, principal: Principal, run_id: UUID, after: int):
        async with self._uow_factory() as uow:
            # Verify ownership even when no event rows exist.
            run = await uow.runs.get_for_owner(principal, run_id)
            if run is None:
                raise RunNotFound(run_id)
            return await uow.runs.list_events_for_owner(principal, run_id, after)


def _run_from_row(row: RunRow) -> Run:
    return Run(
        id=row.run_id,
        session_id=row.session_id,
        status=RunStatus(row.status),
        kind=RunKind(row.kind),
        model_id=row.model_id,
        last_sequence=row.last_sequence,
        cancel_requested=row.cancel_requested,
        error_code=row.error_code,
        error_message=row.error_message,
        pause_payload=dict(row.pause_payload),
        usage=Usage(row.input_tokens, row.output_tokens),
    )


class _ActiveRunReader:
    def __init__(self, session_factory) -> None:
        self._session_factory = session_factory

    async def list_for_owner(self, principal: Principal) -> list[Run]:
        active = {
            RunStatus.QUEUED.value,
            RunStatus.RUNNING.value,
            RunStatus.AWAITING_APPROVAL.value,
            RunStatus.AWAITING_USER_ANSWER.value,
        }
        async with self._session_factory() as session:
            rows = (
                await session.scalars(
                    select(RunRow)
                    .join(SessionRow, SessionRow.session_id == RunRow.session_id)
                    .where(
                        SessionRow.owner_issuer == principal.issuer,
                        SessionRow.owner_subject == principal.subject,
                        RunRow.status.in_(active),
                    )
                    .order_by(RunRow.created_at, RunRow.run_id)
                )
            ).all()
        return [_run_from_row(row) for row in rows]


class _ArtifactApiService:
    """Give each artifact operation its own committed SQLAlchemy transaction."""

    def __init__(self, session_factory, store_factory, max_bytes: int) -> None:
        self._session_factory = session_factory
        self._store_factory = store_factory
        self._store: S3ArtifactStore | None = None
        self._max_bytes = max_bytes

    def _service(self, session: AsyncSession) -> ArtifactService:
        if self._store is None:
            self._store = self._store_factory()
        return ArtifactService(
            SqlAlchemyArtifactRepository(session),
            self._store,
            max_bytes=self._max_bytes,
        )

    async def put(self, principal: Principal, **kwargs):
        async with self._session_factory() as session, session.begin():
            return await self._service(session).put(principal, **kwargs)

    async def list(self, principal: Principal, session_id: UUID, **kwargs):
        async with self._session_factory() as session, session.begin():
            return await self._service(session).list(principal, session_id, **kwargs)

    async def get_metadata(self, principal: Principal, artifact_id: UUID):
        async with self._session_factory() as session, session.begin():
            artifact = await SqlAlchemyArtifactRepository(session).get_for_owner(
                principal, artifact_id
            )
            if artifact is None:
                raise ArtifactNotFound(f"Artifact not found: {artifact_id}")
            return artifact

    async def get_content(self, principal: Principal, artifact_id: UUID) -> bytes:
        async with self._session_factory() as session, session.begin():
            return await self._service(session).get_content(principal, artifact_id)

    async def get_download_url(self, principal: Principal, artifact_id: UUID) -> str:
        async with self._session_factory() as session, session.begin():
            return await self._service(session).get_download_url(principal, artifact_id)


class _ReadinessProbe:
    def __init__(
        self,
        *,
        engine: AsyncEngine | None,
        redis: Redis | None,
        settings: Settings,
        oauth_issuer: str,
        oauth_jwks_url: str,
    ) -> None:
        self._engine = engine
        self._redis = redis
        self._settings = settings
        self._oauth_issuer = oauth_issuer
        self._oauth_jwks_url = oauth_jwks_url

    async def check(self) -> dict[str, str]:
        checks = {
            "database": "not_ready",
            "queue": "not_ready",
            "settings": "not_ready",
        }
        required_settings = (
            self._settings.ai_database_url.strip(),
            self._settings.ai_redis_url.strip(),
            self._settings.credential_lease_secret.strip(),
            self._oauth_issuer,
            self._oauth_jwks_url,
        )
        if all(required_settings):
            checks["settings"] = "ready"

        if self._engine is not None:
            try:
                async with self._engine.connect() as connection:
                    await connection.execute(text("SELECT 1"))
                checks["database"] = "ready"
            except Exception:
                logger.warning("AI database readiness check failed", exc_info=True)

        if self._redis is not None:
            try:
                if await self._redis.ping():
                    checks["queue"] = "ready"
            except Exception:
                logger.warning("AI queue readiness check failed", exc_info=True)
        return checks


def _oauth_locations(settings: Settings) -> tuple[str, str]:
    backend_origin = settings.mcp_token_exchange_url.split("/api/", 1)[0].rstrip("/")
    issuer = os.environ.get("AI_OAUTH_ISSUER", "").strip().rstrip("/")
    jwks_url = os.environ.get(
        "AI_OAUTH_JWKS_URL", f"{backend_origin}/.well-known/jwks.json"
    )
    return issuer, jwks_url


def _artifact_store(settings: Settings) -> S3ArtifactStore:
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    issuer, jwks_url = _oauth_locations(settings)
    app.state.jwt_verifier = (
        JwtVerifier(issuer, PyJWKClient(jwks_url))
        if issuer and jwks_url
        else _RejectingVerifier()
    )
    app.state.sse_poll_seconds = 0.5

    engine: AsyncEngine | None = None
    redis: Redis | None = None
    checkpoints: LangGraphCheckpointStore | _UnavailableCheckpoints = (
        _UnavailableCheckpoints()
    )
    if settings.ai_database_url.strip():
        engine = create_async_engine_from_settings()
        session_factory = async_sessionmaker(
            engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )

        def uow_factory() -> SqlAlchemyUnitOfWork:
            return SqlAlchemyUnitOfWork(session_factory)

        checkpoints = LangGraphCheckpointStore(database_url=settings.ai_database_url)
        await checkpoints.setup()

        redis = Redis.from_url(settings.ai_redis_url, decode_responses=False)
        credentials: Any = _UnavailableCredentials()
        if settings.credential_lease_secret.strip():
            # Importing the MCP transport loads the Agent SDK stack. Keep it
            # out of module import/OpenAPI generation and initialize it only
            # in the production lifespan.
            from infrastructure.mcp.preflight import McpPreflight

            lease_store = RedisCredentialLeaseStore(
                redis,
                secret=settings.credential_lease_secret,
                mcp_server_id=settings.mcp_server_id,
            )
            credentials = CredentialService(
                lease_store,
                McpTokenExchangeClient(settings.mcp_token_exchange_url),
                McpPreflight(settings.qjudge_mcp_url),
            )

        app.state.session_service = SessionService(uow_factory, checkpoints)
        app.state.run_service = RunService(
            uow_factory,
            credentials,
            CeleryRunDispatcher(celery_app),
        )
        app.state.event_reader = _PersistedEventReader(uow_factory)
        app.state.active_run_reader = _ActiveRunReader(session_factory)
        app.state.usage_service = UsageService(uow_factory)
        app.state.artifact_service = _ArtifactApiService(
            session_factory,
            lambda: _artifact_store(settings),
            settings.artifact_max_bytes,
        )

    app.state.readiness_probe = _ReadinessProbe(
        engine=engine,
        redis=redis,
        settings=settings,
        oauth_issuer=issuer,
        oauth_jwks_url=jwks_url,
    )
    try:
        yield
    finally:
        if isinstance(checkpoints, LangGraphCheckpointStore):
            await checkpoints.close()
        if redis is not None:
            await redis.aclose()
        if engine is not None:
            await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Autonomous AI session, run, event and artifact service",
        lifespan=lifespan,
    )

    app.state.jwt_verifier = _RejectingVerifier()
    app.state.readiness_probe = _ReadinessProbe(
        engine=None,
        redis=None,
        settings=settings,
        oauth_issuer="",
        oauth_jwks_url="",
    )
    app.state.sse_poll_seconds = 0.5

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", "").strip() or str(uuid4())
        traceparent = request.headers.get("traceparent")
        request.state.request_id = request_id
        request.state.traceparent = traceparent
        token = set_current_trace(TraceContext(request_id, traceparent))
        try:
            response = await call_next(request)
        finally:
            reset_current_trace(token)
        response.headers["X-Request-ID"] = request_id
        if traceparent:
            response.headers["traceparent"] = traceparent
        return response

    install_error_handlers(app)
    app.include_router(health_router)
    app.include_router(sessions_router)
    app.include_router(runs_router)
    app.include_router(artifacts_router)
    app.include_router(system_router)
    return app


app = create_app()
