"""Private FastAPI surface for one isolated integrity run."""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import Callable, Literal
from uuid import UUID

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from integrity_service.core.schemas import EventBatch
from integrity_service.core.sequencer import SequenceConflict
from integrity_service.journal.archive import (
    ArchiveFatalFailure,
    ArchiveRetryableFailure,
    ArchiveUploadFailed,
)
from integrity_service.journal.command_outbox import CommandDeliveryProtocolError
from integrity_service.journal.writer import BatchIdentityConflict
from integrity_service.worker.auth import (
    RequestAuthenticationError,
    verify_backend_request,
)
from integrity_service.worker.backend_client import (
    BackendClient,
    BackendProtocolError,
    BackendUnavailable,
)
from integrity_service.worker.runtime import (
    RunMismatch,
    SchedulerFailed,
    WorkerNotAccepting,
    WorkerRuntime,
)
from integrity_service.worker.settings import WorkerBootstrap, WorkerSettings


class SubmissionObservation(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schema_version: Literal[1]
    participant_id: int = Field(gt=0)
    source: Literal["manual", "backend"]


def create_app(
    *,
    runtime: WorkerRuntime | None = None,
    now_seconds: Callable[[], int] | None = None,
    start_scheduler: bool = True,
) -> FastAPI:
    clock_seconds = now_seconds or (lambda: int(time.time()))

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        owned_backend: BackendClient | None = None
        owned_runtime: WorkerRuntime | None = None
        resolved = runtime
        cleanup_error: BaseException | None = None
        try:
            if resolved is None:
                settings = WorkerSettings.from_environment()
                owned_backend = BackendClient(
                    base_url=settings.backend_base_url,
                    run_id=settings.run_id,
                    token=settings.read_token(),
                    retry_attempts=settings.retry_attempts,
                    connect_timeout_seconds=settings.connect_timeout_seconds,
                    request_timeout_seconds=settings.request_timeout_seconds,
                )
                bootstrap = WorkerBootstrap.from_payload(
                    owned_backend.fetch_bootstrap()
                )
                if bootstrap.run_id != settings.run_id:
                    raise RuntimeError(
                        "Backend bootstrap run does not match Worker scope"
                    )
                resolved = WorkerRuntime(
                    bootstrap=bootstrap,
                    data_root=settings.data_root,
                    backend=owned_backend,
                )
                owned_runtime = resolved
            application.state.runtime = resolved
            if start_scheduler:
                await resolved.start_scheduler()
            yield
        finally:
            if resolved is not None:
                try:
                    await resolved.stop_scheduler()
                except BaseException as error:
                    cleanup_error = error
            if owned_runtime is not None:
                try:
                    owned_runtime.close()
                except BaseException as error:
                    if cleanup_error is None:
                        cleanup_error = error
            if owned_backend is not None:
                try:
                    owned_backend.close()
                except BaseException as error:
                    if cleanup_error is None:
                        cleanup_error = error
            if cleanup_error is not None:
                raise cleanup_error

    application = FastAPI(lifespan=lifespan)
    if runtime is not None:
        application.state.runtime = runtime

    def current_runtime(request: Request) -> WorkerRuntime:
        resolved = getattr(request.app.state, "runtime", None)
        if not isinstance(resolved, WorkerRuntime):
            raise HTTPException(status_code=503, detail="Worker is not initialized")
        return resolved

    async def authenticate(
        request: Request, *, path_run_id: UUID, resolved: WorkerRuntime
    ) -> bytes:
        if path_run_id != resolved.run_id:
            raise HTTPException(
                status_code=401, detail="request authentication failed"
            )
        body = await request.body()
        try:
            verify_backend_request(
                resolved.bootstrap.backend_signing_public_key,
                body=body,
                timestamp=request.headers.get("X-QJudge-Timestamp", ""),
                path_run_id=path_run_id,
                expected_run_id=resolved.run_id,
                header_run_id=request.headers.get("X-QJudge-Run-Id", ""),
                signature_b64=request.headers.get("X-QJudge-Signature", ""),
                now_seconds=clock_seconds(),
            )
        except (RequestAuthenticationError, ValueError) as error:
            raise HTTPException(
                status_code=401, detail="request authentication failed"
            ) from error
        return body

    @application.post("/v1/runs/{run_id}/batches")
    async def ingest_batch(run_id: UUID, request: Request):
        resolved = current_runtime(request)
        body = await authenticate(request, path_run_id=run_id, resolved=resolved)
        try:
            batch = EventBatch.model_validate_json(body)
        except ValidationError as error:
            raise HTTPException(status_code=422, detail="invalid event batch") from error
        try:
            ack = resolved.ingest(batch, resolved._clock_ms())
        except (RunMismatch, SequenceConflict, BatchIdentityConflict) as error:
            raise HTTPException(status_code=409, detail="batch conflict") from error
        except WorkerNotAccepting as error:
            raise HTTPException(status_code=409, detail="Worker is stopping") from error
        except BackendUnavailable as error:
            raise HTTPException(
                status_code=503, detail="Backend delivery unavailable"
            ) from error
        except (BackendProtocolError, CommandDeliveryProtocolError) as error:
            raise HTTPException(
                status_code=502, detail="Backend command protocol failed"
            ) from error
        except (ArchiveFatalFailure, OSError, ValueError) as error:
            raise HTTPException(
                status_code=507, detail="durable journal unavailable"
            ) from error
        return ack.model_dump(mode="json")

    @application.post("/v1/runs/{run_id}/observations/submission")
    async def observe_submission(run_id: UUID, request: Request):
        resolved = current_runtime(request)
        body = await authenticate(request, path_run_id=run_id, resolved=resolved)
        try:
            observation = SubmissionObservation.model_validate_json(body)
        except ValidationError as error:
            raise HTTPException(
                status_code=422, detail="invalid submission observation"
            ) from error
        try:
            timeline_seq = resolved.record_submission(
                participant_id=observation.participant_id,
                source=observation.source,
                server_ms=resolved._clock_ms(),
            )
        except WorkerNotAccepting as error:
            raise HTTPException(status_code=409, detail="Worker is stopping") from error
        except BackendUnavailable as error:
            raise HTTPException(
                status_code=503, detail="Backend delivery unavailable"
            ) from error
        except (BackendProtocolError, CommandDeliveryProtocolError) as error:
            raise HTTPException(
                status_code=502, detail="Backend command protocol failed"
            ) from error
        except (OSError, ValueError) as error:
            raise HTTPException(
                status_code=507, detail="durable journal unavailable"
            ) from error
        return {"observed": True, "timeline_seq": timeline_seq}

    @application.post("/v1/runs/{run_id}/control/stop")
    async def stop_run(run_id: UUID, request: Request):
        resolved = current_runtime(request)
        await authenticate(request, path_run_id=run_id, resolved=resolved)
        try:
            resolved.begin_stop()
            await resolved.stop_scheduler()
            result = resolved.stop()
        except (ArchiveRetryableFailure, BackendUnavailable) as error:
            raise HTTPException(
                status_code=503,
                detail={"archived": False, "state": resolved.state},
            ) from error
        except (BackendProtocolError, CommandDeliveryProtocolError) as error:
            raise HTTPException(
                status_code=502,
                detail={
                    "archived": False,
                    "state": resolved.state,
                    "error": "archive protocol failed",
                },
            ) from error
        except SchedulerFailed as error:
            raise HTTPException(
                status_code=503,
                detail={
                    "archived": False,
                    "state": resolved.state,
                    "error": "scheduler failed",
                },
            ) from error
        except (ArchiveFatalFailure, ArchiveUploadFailed, OSError, ValueError) as error:
            resolved._mark_unhealthy("archive_durability_failed")
            raise HTTPException(
                status_code=507,
                detail={
                    "archived": False,
                    "state": resolved.state,
                    "error": "archive durability failed",
                },
            ) from error
        return {
            "archived": result.archived,
            "manifest_key": result.manifest_key,
            "manifest_sha256": result.manifest_sha256,
        }

    @application.get("/health")
    async def health(request: Request):
        resolved = current_runtime(request)
        await authenticate(
            request, path_run_id=resolved.run_id, resolved=resolved
        )
        snapshot = resolved.health_snapshot()
        if not snapshot.healthy:
            raise HTTPException(
                status_code=503,
                detail={
                    "healthy": False,
                    "state": snapshot.state,
                    "last_scheduler_error": snapshot.last_scheduler_error,
                },
            )
        return {
            "healthy": True,
            "state": snapshot.state,
            "accepting": snapshot.accepting,
            "warning_codes": list(snapshot.warning_codes),
            "last_scheduler_error": snapshot.last_scheduler_error,
        }

    return application


app = create_app()
