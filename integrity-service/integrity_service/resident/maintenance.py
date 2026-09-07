"""No-queue pools: global admission and single in-flight job per Run per lane."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import threading


class Busy(RuntimeError):
    pass


class BoundedPool:
    def __init__(self, workers, name):
        self._pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix=name)
        self._slots = threading.BoundedSemaphore(workers)
        self._lock = threading.Lock()
        self._runs = set()
        self._closed = False

    def submit(self, run_id, function, *args):
        with self._lock:
            if self._closed or run_id in self._runs or not self._slots.acquire(blocking=False):
                raise Busy("resident lane capacity reached")
            self._runs.add(run_id)
        try:
            future = self._pool.submit(function, *args)
        except BaseException:
            self._release(run_id)
            raise
        future.add_done_callback(lambda _: self._release(run_id))
        return future

    def _release(self, run_id):
        with self._lock:
            self._runs.discard(run_id)
            self._slots.release()

    async def run(self, run_id, function, *args):
        # A disconnected caller must not release admission while disk work runs.
        return await asyncio.shield(asyncio.wrap_future(self.submit(run_id, function, *args)))

    def close(self):
        with self._lock:
            self._closed = True
        self._pool.shutdown(wait=True, cancel_futures=False)


class Maintenance:
    def __init__(self, registry, settings):
        self.registry, self.settings = registry, settings
        self.decisions = BoundedPool(settings.decision_workers, "resident-decision")
        self.deliveries = BoundedPool(settings.delivery_workers, "resident-delivery")
        self.errors = {}
        self._offset = 0

    def _job(self, run_id, kind):
        try:
            runtime = self.registry.get(run_id)
            if kind == "decision":
                runtime.process_pending(self.settings.process_batch_size)
            else:
                runtime.outbox.deliver_pending(runtime.backend, max_batches=1)
            self.errors.pop((run_id, kind), None)
        except Exception as error:
            self.errors[(run_id, kind)] = type(error).__name__

    def tick(self):
        ids = self.registry.run_ids()
        if not ids:
            return
        offset = self._offset % len(ids)
        self._offset += 1
        for run_id in ids[offset:] + ids[:offset]:
            for kind, pool in (("decision", self.decisions), ("delivery", self.deliveries)):
                try:
                    pool.submit(run_id, self._job, run_id, kind)
                except Busy:
                    pass

    async def loop(self):
        while True:
            self.tick()
            await asyncio.sleep(self.settings.maintenance_interval)

    def close(self):
        self.decisions.close()
        self.deliveries.close()
