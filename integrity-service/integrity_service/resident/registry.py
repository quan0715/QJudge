"""Bounded registry with one writer per volume and independent Run locks."""
import fcntl
from contextlib import contextmanager
import threading
from pathlib import Path
from uuid import UUID

from integrity_service.journal.command_outbox import DurableJsonLog
from integrity_service.journal.durability import ensure_durable_directory
from integrity_service.worker.runtime import WorkerRuntime
from .contracts import RunDescriptor


class DescriptorConflict(ValueError):
    pass


class RegistryFull(RuntimeError):
    pass


class RunRegistry:
    def __init__(self, root: Path, backend_factory, *, max_runs=256):
        self.root, self.backend_factory, self.max_runs = root, backend_factory, max_runs
        ensure_durable_directory(root)
        self._owner = (root / "resident.lock").open("a+b")
        try:
            fcntl.flock(self._owner, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BaseException:
            self._owner.close()
            raise RuntimeError("resident volume already has a writer")
        self._lock = threading.RLock()
        self._locks = {}
        self._references = {}
        self._retired = set()
        self._finalizing = set()
        self.finalize_requests = {}
        self._runtimes = {}
        self._descriptors = {}
        self.errors = {}
        self._closed = False

    @contextmanager
    def _run_lock(self, run_id):
        with self._lock:
            if self._closed:
                raise RuntimeError("registry is closed")
            if run_id not in self._locks:
                if len(self._locks) >= self.max_runs:
                    raise RegistryFull("resident run capacity reached")
                self._locks[run_id] = threading.RLock()
            lock = self._locks[run_id]
            self._references[run_id] = self._references.get(run_id, 0) + 1
        try:
            with lock:
                yield
        finally:
            with self._lock:
                self._references[run_id] -= 1
                if not self._references[run_id] and run_id in self._retired:
                    self._locks.pop(run_id, None)
                    self._references.pop(run_id, None)
                    self._retired.discard(run_id)

    def ensure(self, descriptor: RunDescriptor, service_gap=None) -> WorkerRuntime:
        run_id = descriptor.bootstrap.run_id
        with self._run_lock(run_id):
            prior = self._descriptors.get(run_id)
            log = None
            backend = None
            try:
                log = DurableJsonLog(self.root / str(run_id) / "descriptor.log")
                if prior is None and log.records:
                    prior = RunDescriptor.from_payload(log.records[-1])
                if prior is not None:
                    if descriptor.immutable_identity() != prior.immutable_identity():
                        raise DescriptorConflict("immutable Run snapshot changed")
                    if descriptor.schedule_revision < prior.schedule_revision:
                        raise DescriptorConflict("stale schedule revision")
                    if descriptor.schedule_revision == prior.schedule_revision and descriptor.schedule() != prior.schedule():
                        raise DescriptorConflict("schedule revision content conflicts")
                    if prior.session_state in {"archived", "closed"} and descriptor.session_state not in {"archived", "closed"}:
                        raise DescriptorConflict("terminal Run cannot reopen")
                    order = {"prepared": 0, "active": 1, "draining": 2, "archived": 3, "closed": 4}
                    if (descriptor.schedule_revision == prior.schedule_revision
                            and order[descriptor.session_state] < order[prior.session_state]):
                        raise DescriptorConflict("stale session state")
                # Reconciler timestamps/participant snapshots vary on every GET;
                # persist control transitions, not an ever-growing polling log.
                if prior is None or (descriptor.schedule_revision, descriptor.schedule(), descriptor.session_state) != (prior.schedule_revision, prior.schedule(), prior.session_state):
                    log.append(descriptor.to_payload())
                if run_id not in self._runtimes:
                    backend = self.backend_factory(run_id)
                    self._runtimes[run_id] = WorkerRuntime(bootstrap=descriptor.bootstrap, data_root=self.root, backend=backend, resident_mode=True)
                elif prior and descriptor.schedule_revision > prior.schedule_revision:
                    self.finalize_requests.pop(run_id, None)
                    runtime = self._runtimes[run_id]
                    with runtime._lock:
                        if runtime.healthy and descriptor.session_state in {"prepared", "active", "draining"}:
                            runtime._accepting, runtime._state = True, "RUNNING"
                self._descriptors[run_id] = descriptor
                if service_gap is not None:
                    self.apply_trusted_gap(self._runtimes[run_id], service_gap)
                self.errors.pop(run_id, None)
                return self._runtimes[run_id]
            except Exception as error:
                if backend is not None and hasattr(backend, "close"):
                    backend.close()
                if not isinstance(error, DescriptorConflict):
                    self.errors[run_id] = type(error).__name__
                elif run_id not in self._runtimes:
                    self._retired.add(run_id)
                raise
            finally:
                if log is not None:
                    log.close()

    def get(self, run_id: UUID):
        with self._lock:
            if self._closed:
                raise KeyError(run_id)
            return self._runtimes[run_id]

    def descriptor(self, run_id):
        with self._lock:
            return self._descriptors[run_id]

    def finalize(self, run_id, expected_revision):
        from .lifecycle import finalize
        from .maintenance import Busy
        with self._lock:
            self.get(run_id)
            if run_id in self._finalizing:
                raise Busy("Run archive already in flight")
            self._finalizing.add(run_id)
            if self.descriptor(run_id).schedule_revision == expected_revision:
                self.finalize_requests[run_id] = expected_revision
        try:
            return finalize(self, run_id, expected_revision)
        except Exception as error:
            self.errors[run_id] = type(error).__name__
            raise
        finally:
            with self._lock:
                self._finalizing.discard(run_id)

    def record_service_gap(self, run_id, started_ms, ended_ms, reason):
        # Internal trusted incident reports only; unknown IDs never allocate a
        # runtime or consume a registry slot. Runtime serializes with decisions.
        runtime = self.get(run_id)
        with self._run_lock(run_id):
            runtime.record_service_gap(started_ms, ended_ms, reason)

    @staticmethod
    def apply_trusted_gap(runtime, gap):
        if type(gap) is not dict or set(gap) != {"generation", "started_ms", "ended_ms", "reason"}:
            raise ValueError("invalid trusted gap")
        runtime.record_service_gap(gap["started_ms"], gap["ended_ms"], gap["reason"], generation=gap["generation"])

    def run_ids(self):
        with self._lock:
            return tuple(self._runtimes)

    def recover(self, payloads):
        # Only an authenticated backend response may supply these descriptors.
        # Local files alone never authorize a Run or its latest schedule.
        for payload in payloads:
            try:
                self.ensure(RunDescriptor.from_payload(payload), payload.get("service_gap"))
            except Exception:
                continue

    def close(self):
        with self._lock:
            if self._closed:
                return
            self._closed = True
        try:
            for run_id, runtime in self._runtimes.items():
                with self._locks[run_id]:
                    try:
                        runtime.close()
                    finally:
                        if hasattr(runtime.backend, "close"):
                            runtime.backend.close()
        finally:
            self._owner.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()
