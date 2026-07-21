"""Private FastAPI surface for one isolated integrity run."""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import Callable
from uuid import UUID

from fastapi import FastAPI, HTTPException, Request
from pydantic import ValidationError

from integrity_service.core.schemas import EventBatch
from integrity_service.core.sequencer import SequenceConflict
from integrity_service.journal.archive import ArchiveUploadFailed
from integrity_service.journal.writer import BatchIdentityConflict
from integrity_service.worker.auth import (
    RequestAuthenticationError,
    load_public_key,
    verify_backend_request,
)
from integrity_service.worker.backend_client import (
    BackendClient,
    BackendProtocolError,
    BackendUnavailable,
)
from integrity_service.worker.runtime import (
    RunMismatch,
    WorkerNotAccepting,
    WorkerRuntime,
)
from integrity_service.worker.settings import WorkerBootstrap, WorkerSettings


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
        resolved = runtime
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
            bootstrap = WorkerBootstrap.from_payload(owned_backend.fetch_bootstrap())
            if bootstrap.run_id != settings.run_id:
                owned_backend.close()
                raise RuntimeError("Backend bootstrap run does not match Worker scope")
            resolved = WorkerRuntime(
                bootstrap=bootstrap,
                data_root=settings.data_root,
                backend=owned_backend,
            )
        application.state.runtime = resolved
        if start_scheduler:
            await resolved.start_scheduler()
        try:
            yield
        finally:
            await resolved.stop_scheduler()
            if owned_backend is not None:
                resolved.close()
                owned_backend.close()

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
        body = await request.body()
        try:
            verify_backend_request(
                load_public_key(
                    resolved.bootstrap.backend_signing_public_key_b64
                ),
                body=body,
                timestamp=request.headers.get("X-QJudge-Timestamp", ""),
                path_run_id=path_run_id,
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
        except OSError as error:
            raise HTTPException(
                status_code=507, detail="durable journal unavailable"
            ) from error
        return ack.model_dump(mode="json")

    @application.post("/v1/runs/{run_id}/control/stop")
    async def stop_run(run_id: UUID, request: Request):
        resolved = current_runtime(request)
        await authenticate(request, path_run_id=run_id, resolved=resolved)
        resolved.begin_stop()
        await resolved.stop_scheduler()
        try:
            result = resolved.stop()
        except (ArchiveUploadFailed, BackendUnavailable, BackendProtocolError) as error:
            raise HTTPException(
                status_code=503,
                detail={"archived": False, "state": resolved.state},
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
        if not resolved.healthy:
            raise HTTPException(
                status_code=503,
                detail={"healthy": False, "state": resolved.state},
            )
        return {
            "healthy": True,
            "state": resolved.state,
            "accepting": resolved.accepting,
            "warning_codes": sorted(resolved.warning_codes),
        }

    return application


app = create_app()
