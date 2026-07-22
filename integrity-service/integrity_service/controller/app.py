"""Authenticated private API for fixed Docker Worker lifecycle operations."""

from __future__ import annotations

import asyncio
import hmac
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import TypeVar
from uuid import UUID

from fastapi import FastAPI, HTTPException, Request
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse

from integrity_service.controller.docker_runtime import (
    ControllerConflict,
    DockerRuntime,
    ImageNotAllowed,
)
from integrity_service.controller.schemas import (
    DestroyRunResponse,
    EmptyLifecycleRequest,
    PurgeDataResponse,
    RunStatusResponse,
    StartRunRequest,
    StartRunResponse,
    StopRunResponse,
    StrictControllerModel,
)
from integrity_service.controller.settings import ControllerSettings


Schema = TypeVar("Schema", bound=StrictControllerModel)


@dataclass(slots=True)
class _RunLockEntry:
    lock: asyncio.Lock
    users: int = 0


def _docker_client_from_environment():
    try:
        import docker
    except ImportError as error:
        raise RuntimeError("Docker SDK is unavailable") from error
    return docker.from_env()


def create_app(
    *,
    runtime: DockerRuntime | object | None = None,
    settings: ControllerSettings | None = None,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(application: FastAPI):
        owned_runtime = None
        if settings is None:
            application.state.settings = ControllerSettings.from_environment()
        if runtime is None:
            owned_runtime = DockerRuntime(
                client=await run_in_threadpool(_docker_client_from_environment),
                settings=application.state.settings,
            )
            application.state.runtime = owned_runtime
        try:
            yield
        finally:
            if owned_runtime is not None:
                await run_in_threadpool(owned_runtime.close)

    application = FastAPI(
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    if settings is not None:
        application.state.settings = settings
    if runtime is not None:
        application.state.runtime = runtime
    run_locks: dict[UUID, _RunLockEntry] = {}
    application.state.run_locks = run_locks

    def current_settings(request: Request) -> ControllerSettings:
        resolved = getattr(request.app.state, "settings", None)
        if not isinstance(resolved, ControllerSettings):
            raise HTTPException(status_code=503, detail="Controller is not initialized")
        return resolved

    def current_runtime(request: Request):
        resolved = getattr(request.app.state, "runtime", None)
        if resolved is None:
            raise HTTPException(status_code=503, detail="Controller is not initialized")
        return resolved

    def authenticate(request: Request) -> None:
        authorization = request.headers.get("Authorization", "")
        if not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="request authentication failed")
        credential = authorization.removeprefix("Bearer ")
        try:
            expected = current_settings(request).read_internal_token_bytes()
        except RuntimeError as error:
            raise HTTPException(
                status_code=503, detail="Controller credential unavailable"
            ) from error
        try:
            provided = credential.encode("utf-8")
        except UnicodeError:
            provided = b""
        if not provided or not hmac.compare_digest(provided, expected):
            raise HTTPException(status_code=401, detail="request authentication failed")

    @application.middleware("http")
    async def authenticate_before_routing(request: Request, call_next):
        try:
            authenticate(request)
        except HTTPException as error:
            return JSONResponse(
                status_code=error.status_code,
                content={"detail": error.detail},
            )
        return await call_next(request)

    async def parse_body(request: Request, schema: type[Schema]) -> Schema:
        try:
            payload = await request.json()
            return schema.model_validate(payload)
        except (ValueError, ValidationError) as error:
            raise HTTPException(status_code=422, detail="invalid request") from error

    async def execute(run_id: UUID, operation):
        entry = run_locks.get(run_id)
        if entry is None:
            entry = _RunLockEntry(lock=asyncio.Lock())
            run_locks[run_id] = entry
        entry.users += 1
        try:
            async with entry.lock:
                return await run_in_threadpool(operation)
        except ImageNotAllowed as error:
            raise HTTPException(status_code=403, detail="Worker image is not allowed") from error
        except ControllerConflict as error:
            raise HTTPException(status_code=409, detail="Docker lifecycle conflict") from error
        except Exception as error:
            raise HTTPException(
                status_code=503, detail="Docker lifecycle unavailable"
            ) from error
        finally:
            entry.users -= 1
            if entry.users == 0 and run_locks.get(run_id) is entry:
                del run_locks[run_id]

    @application.post("/v1/runs/{run_id}/start")
    async def start_run(run_id: UUID, request: Request):
        payload = await parse_body(request, StartRunRequest)
        result = await execute(
            run_id,
            lambda: current_runtime(request).start(
                run_id, payload.run_token, payload.worker_image
            )
        )
        return StartRunResponse.model_validate(result).model_dump(mode="json")

    @application.post("/v1/runs/{run_id}/stop")
    async def stop_run(run_id: UUID, request: Request):
        await parse_body(request, EmptyLifecycleRequest)
        result = await execute(run_id, lambda: current_runtime(request).stop(run_id))
        return StopRunResponse.model_validate(result).model_dump(mode="json")

    @application.post("/v1/runs/{run_id}/destroy")
    async def destroy_run(run_id: UUID, request: Request):
        await parse_body(request, EmptyLifecycleRequest)
        result = await execute(
            run_id, lambda: current_runtime(request).destroy(run_id)
        )
        return DestroyRunResponse.model_validate(result).model_dump(mode="json")

    @application.post("/v1/runs/{run_id}/purge-data")
    async def purge_run_data(run_id: UUID, request: Request):
        await parse_body(request, EmptyLifecycleRequest)
        result = await execute(
            run_id, lambda: current_runtime(request).purge_data(run_id)
        )
        return PurgeDataResponse.model_validate(result).model_dump(mode="json")

    @application.get("/v1/runs/{run_id}/status")
    async def run_status(run_id: UUID, request: Request):
        result = await execute(run_id, lambda: current_runtime(request).status(run_id))
        return RunStatusResponse.model_validate(result).model_dump(mode="json")

    return application


app = create_app()
