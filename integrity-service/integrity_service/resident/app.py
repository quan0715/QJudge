"""Opt-in resident HTTP entrypoint; legacy worker.app remains the default."""
import asyncio
from contextlib import asynccontextmanager, suppress
import json
from pathlib import Path
import time
from uuid import UUID

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from integrity_service.core.schemas import EventBatch
from integrity_service.core.sequencer import SequenceConflict
from integrity_service.journal.writer import BatchIdentityConflict
from integrity_service.worker.auth import verify_resident_request, RequestAuthenticationError
from integrity_service.worker.backend_client import BackendClient
from integrity_service.worker.runtime import WorkerNotAccepting, RunMismatch
from .contracts import PROTOCOL, RunDescriptor
from .maintenance import BoundedPool, Busy, Maintenance
from .registry import RunRegistry, DescriptorConflict, RegistryFull
from .settings import ResidentSettings


def create_app(*, registry=None, public_key=None, settings=None, now_ms=None,
               descriptor_loader=None, start_maintenance=True):
    clock = now_ms or (lambda: time.time_ns() // 1_000_000)

    @asynccontextmanager
    async def lifespan(app):
        nonlocal registry, public_key, settings, descriptor_loader
        settings = settings or (ResidentSettings.from_environment() if registry is None else ResidentSettings(registry.root, "", Path("unused"), Path("unused")))
        public_key = public_key or settings.read_public_key()
        if registry is None:
            registry = RunRegistry(settings.root, lambda run_id: BackendClient(
                base_url=settings.backend_url, run_id=run_id, token=settings.read_credential(), resident_mode=True,
                credential_provider=settings.read_credential, retry_attempts=1), max_runs=settings.max_runs)
            def load():
                client = BackendClient(base_url=settings.backend_url, run_id=UUID(int=0), token=settings.read_credential(), resident_mode=True, retry_attempts=1)
                try:
                    return client.fetch_resident_descriptors(public_key)
                finally:
                    client.close()
            descriptor_loader = descriptor_loader or load
        receipts = BoundedPool(settings.receipt_workers, "resident-receipt")
        controls = BoundedPool(settings.control_workers, "resident-control")
        maintenance = Maintenance(registry, settings)
        app.state.receipts, app.state.controls, app.state.maintenance = receipts, controls, maintenance
        app.state.ready = True
        app.state.recovery_error = None
        task = None
        try:
            if descriptor_loader:
                try:
                    payloads = await controls.run("recovery-fetch", descriptor_loader)
                    await controls.run("recovery-load", registry.recover, payloads)
                except Exception as error:
                    app.state.recovery_error = type(error).__name__
            if start_maintenance:
                task = asyncio.create_task(maintenance.loop())
            yield
        finally:
            app.state.ready = False
            if task:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
            # Drain admitted jobs before closing their durable stores; closing
            # resources never invokes legacy stop/archive or discards pending WAL.
            await asyncio.to_thread(receipts.close)
            await asyncio.to_thread(controls.close)
            await asyncio.to_thread(maintenance.close)
            await asyncio.to_thread(registry.close)

    app = FastAPI(lifespan=lifespan)

    @app.exception_handler(Busy)
    @app.exception_handler(RegistryFull)
    async def busy(_request, _error):
        return JSONResponse({"detail": "resident capacity reached"}, status_code=503, headers={"Retry-After": "1"})

    async def authenticate(request, run_id):
        chunks, size = [], 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > settings.max_body_bytes:
                raise HTTPException(413, "resident body too large")
            chunks.append(chunk)
        body = b"".join(chunks)
        h = request.headers
        revision = h.get("X-QJudge-Revision", "")
        try:
            verify_resident_request(public_key, method=request.method, path=request.url.path,
                run_id=run_id, revision=revision, protocol=h.get("X-QJudge-Protocol", ""),
                timestamp=h.get("X-QJudge-Timestamp", ""), header_run_id=h.get("X-QJudge-Run-Id", ""),
                signature_b64=h.get("X-QJudge-Signature", ""), body=body, now_seconds=clock() // 1000)
        except (RequestAuthenticationError, ValueError) as error:
            raise HTTPException(401, "resident authentication failed") from error
        return body, int(revision)

    @app.put("/v1/runs/{run_id}")
    async def ensure(run_id: UUID, request: Request):
        body, revision = await authenticate(request, run_id)
        try:
            descriptor = RunDescriptor.from_payload(json.loads(body))
        except (KeyError, ValueError, TypeError) as error:
            raise HTTPException(422, "invalid resident descriptor") from error
        if descriptor.bootstrap.run_id != run_id or descriptor.schedule_revision != revision:
            raise HTTPException(409, "descriptor scope conflict")
        try:
            await app.state.controls.run(run_id, registry.ensure, descriptor)
        except DescriptorConflict as error:
            raise HTTPException(409, str(error)) from error
        except (ValueError, OSError) as error:
            raise HTTPException(507, "Run recovery failed") from error
        return {"protocol": PROTOCOL, "run_id": str(run_id), "schedule_revision": revision}

    def accept(run_id, revision, batch, size, received_at_ms, late_unverified=False):
        # Serialize schedule authorization with ensure; never wait for delivery.
        with registry._run_lock(run_id):
            runtime = registry.get(run_id)
            descriptor = registry.descriptor(run_id)
            if revision != descriptor.schedule_revision:
                raise DescriptorConflict("stale batch schedule")
            if descriptor.session_state not in {"active", "draining"} or received_at_ms > descriptor.accept_until_ms:
                raise WorkerNotAccepting("Run not accepting")
            with runtime._lock:
                if len(runtime.receipts.pending(settings.max_pending_receipts)) >= settings.max_pending_receipts:
                    raise Busy("Run pending capacity reached")
                usage = sum(p.stat().st_size for p in (registry.root / str(run_id)).rglob("*") if p.is_file())
                if usage + size * 4 + 4096 > settings.max_run_bytes:
                    raise OSError("Run storage capacity reached")
                return runtime.accept_batch(batch, received_at_ms, late_unverified=late_unverified)

    @app.post("/v1/runs/{run_id}/batches")
    async def batch(run_id: UUID, request: Request):
        body, revision = await authenticate(request, run_id)
        try:
            registry.get(run_id)
            payload = json.loads(body)
            late = False
            if isinstance(payload, dict) and "batch" in payload:
                if set(payload) != {"batch", "late_unverified"} or type(payload["late_unverified"]) is not bool:
                    raise HTTPException(422, "invalid admission envelope")
                late = payload["late_unverified"]
                payload = payload["batch"]
            value = EventBatch.model_validate(payload)
            if value.run_id != run_id:
                raise RunMismatch("batch scope conflict")
            ack = await app.state.receipts.run(run_id, accept, run_id, revision, value, len(body), clock(), late)
        except KeyError as error:
            raise HTTPException(404, "Run not loaded") from error
        except ValidationError as error:
            raise HTTPException(422, "invalid resident batch") from error
        except (DescriptorConflict, RunMismatch, SequenceConflict, BatchIdentityConflict, WorkerNotAccepting) as error:
            raise HTTPException(409, "Run or batch conflict") from error
        except (ValueError, OSError) as error:
            raise HTTPException(507, "durable receipt unavailable") from error
        return JSONResponse(ack.model_dump(mode="json"), headers={"X-QJudge-Protocol": PROTOCOL})

    @app.post("/v1/runs/{run_id}/progress")
    async def student_progress(run_id: UUID, request: Request):
        body, revision = await authenticate(request, run_id)
        try:
            scope = json.loads(body)
            if (type(scope) is not dict or set(scope) != {"participant_id", "device_id"}
                    or type(scope["participant_id"]) is not int or scope["participant_id"] < 1
                    or type(scope["device_id"]) is not str or not 1 <= len(scope["device_id"]) <= 128):
                raise HTTPException(422, "invalid progress scope")
            runtime = registry.get(run_id)
            if registry.descriptor(run_id).schedule_revision != revision:
                raise HTTPException(409, "stale progress schedule")
            result = await app.state.receipts.run(run_id, runtime.student_progress, scope["participant_id"], scope["device_id"])
        except KeyError as error:
            raise HTTPException(404, "Run unavailable") from error
        except (ValueError, OSError) as error:
            raise HTTPException(503, "progress unavailable") from error
        return JSONResponse(result, headers={"X-QJudge-Protocol": PROTOCOL})

    @app.get("/live")
    async def live():
        return {"alive": True}

    @app.get("/ready")
    async def ready():
        return JSONResponse({"ready": app.state.ready, "protocol": PROTOCOL, "recovery_error": app.state.recovery_error}, status_code=200 if app.state.ready else 503)

    @app.get("/v1/runs/{run_id}/health")
    async def health(run_id: UUID, request: Request):
        await authenticate(request, run_id)
        try:
            runtime = registry.get(run_id)
            snapshot = await app.state.receipts.run(run_id, runtime.health_snapshot)
        except KeyError as error:
            raise HTTPException(503 if run_id in registry.errors else 404, "Run unavailable") from error
        descriptor = registry.descriptor(run_id)
        errors = {kind: error for (rid, kind), error in app.state.maintenance.errors.copy().items() if rid == run_id}
        healthy = snapshot.healthy and not errors
        return JSONResponse({"healthy": healthy,
            "accepting": snapshot.accepting and descriptor.session_state in {"active", "draining"} and clock() <= descriptor.accept_until_ms,
            "schedule_revision": descriptor.schedule_revision,
            "warnings": list(snapshot.warning_codes),
            "service_gaps": {"count": snapshot.service_gap_count,
                "last_ended_ms": snapshot.last_service_gap_ended_ms,
                "suppressed_connectivity_commands": snapshot.suppressed_connectivity_commands,
                "affected_participant_count": snapshot.gap_affected_participant_count},
            "maintenance_errors": errors}, status_code=200 if healthy else 503)

    return app


app = create_app()
