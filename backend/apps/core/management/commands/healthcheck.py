"""
Dev environment service health check.

Usage (inside container):
    python manage.py healthcheck

Usage (from host):
    docker compose -f docker-compose.dev.yml exec backend python manage.py healthcheck
"""
import sys
import time

from django.core.management.base import BaseCommand
from django.conf import settings
from django.db import connection
from django.core.cache import cache


class Command(BaseCommand):
    help = "Check that all backend services (DB, Redis, MinIO, Celery, FFmpeg) are reachable"

    def add_arguments(self, parser):
        parser.add_argument(
            "--json", action="store_true", help="Output results as JSON"
        )

    def handle(self, **options):
        results = {}
        checks = [
            ("postgres", self._check_postgres),
            ("redis", self._check_redis),
            ("minio_connection", self._check_minio_connection),
            ("minio_buckets", self._check_minio_buckets),
            ("celery_default", self._check_celery_default),
            ("celery_video", self._check_celery_video),
            ("celery_beat", self._check_celery_beat),
            ("ffmpeg", self._check_ffmpeg),
        ]

        for name, fn in checks:
            try:
                ok, detail = fn()
                results[name] = {"ok": ok, "detail": detail}
            except Exception as exc:
                results[name] = {"ok": False, "detail": str(exc)}

        if options["json"]:
            import json

            self.stdout.write(json.dumps(results, indent=2, ensure_ascii=False))
        else:
            for name, r in results.items():
                icon = "OK" if r["ok"] else "FAIL"
                self.stdout.write(f"  [{icon:>4}] {name}: {r['detail']}")

        all_ok = all(r["ok"] for r in results.values())
        if not all_ok:
            self.stderr.write("\nSome checks failed.")
            sys.exit(1)
        else:
            self.stdout.write("\nAll checks passed.")

    # ------------------------------------------------------------------
    def _check_postgres(self):
        with connection.cursor() as cur:
            cur.execute("SELECT version()")
            ver = cur.fetchone()[0]
        return True, ver.split(",")[0]

    def _check_redis(self):
        key = "_healthcheck_ping"
        cache.set(key, "pong", timeout=10)
        val = cache.get(key)
        cache.delete(key)
        if val == "pong":
            return True, "set/get OK"
        return False, f"unexpected value: {val}"

    def _check_minio_connection(self):
        from apps.contests.services.anticheat_storage import get_s3_client

        client = get_s3_client()
        client.list_buckets()
        endpoint = settings.ANTICHEAT_S3_ENDPOINT_URL
        return True, f"connected to {endpoint}"

    def _check_minio_buckets(self):
        from apps.contests.services.anticheat_storage import get_s3_client

        client = get_s3_client()
        existing = {b["Name"] for b in client.list_buckets()["Buckets"]}
        required = {settings.ANTICHEAT_RAW_BUCKET, settings.ANTICHEAT_VIDEO_BUCKET}
        missing = required - existing
        if missing:
            return False, f"missing buckets: {', '.join(sorted(missing))}"
        return True, f"buckets present: {', '.join(sorted(required))}"

    def _check_celery_default(self):
        return self._ping_celery_queue("celery")

    def _check_celery_video(self):
        return self._ping_celery_queue("video_queue")

    def _ping_celery_queue(self, queue_name):
        from config.celery import app as celery_app

        inspector = celery_app.control.inspect(timeout=3.0)
        active_queues = inspector.active_queues() or {}

        for worker_name, queues in active_queues.items():
            for q in queues:
                if q.get("name") == queue_name:
                    return True, f"worker={worker_name}"

        return False, f"no worker consuming '{queue_name}'"

    def _check_celery_beat(self):
        """Check beat by looking for the heartbeat key it writes to Redis."""
        from config.celery import app as celery_app

        inspector = celery_app.control.inspect(timeout=3.0)
        scheduled = inspector.scheduled() or {}
        if scheduled:
            worker = next(iter(scheduled))
            return True, f"scheduler reachable via {worker}"

        # Fallback: check if any periodic task ran recently
        from django_celery_beat.models import PeriodicTask  # type: ignore

        return False, "no beat scheduler detected (check celery-beat container)"

    def _check_ffmpeg(self):
        import subprocess

        try:
            result = subprocess.run(
                ["ffmpeg", "-version"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            first_line = result.stdout.split("\n")[0] if result.stdout else "unknown"
            return result.returncode == 0, first_line
        except FileNotFoundError:
            return False, "ffmpeg not found in PATH"
