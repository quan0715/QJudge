"""
Dev environment service health check.

Usage (inside container):
    python manage.py healthcheck

Usage (from host):
    docker compose -f docker-compose.dev.yml exec backend python manage.py healthcheck
"""
import sys

from django.core.management.base import BaseCommand
from django.conf import settings
from django.db import connection
from django.core.cache import cache


class Command(BaseCommand):
    help = "Check that all backend services (DB, Redis, object storage, Celery) are reachable"

    def add_arguments(self, parser):
        parser.add_argument(
            "--json", action="store_true", help="Output results as JSON"
        )

    def handle(self, **options):
        results = {}
        checks = [
            ("postgres", self._check_postgres),
            ("redis", self._check_redis),
            ("object_storage_connection", self._check_object_storage_connection),
            ("object_storage_buckets", self._check_object_storage_buckets),
            ("celery_default", self._check_celery_default),
            ("celery_beat", self._check_celery_beat),
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

    def _check_object_storage_connection(self):
        from apps.contests.services.anticheat_storage import get_s3_client

        buckets = self._configured_object_storage_buckets()
        if not buckets:
            return False, "no object storage buckets configured"

        client = get_s3_client()
        label, bucket = buckets[0]
        client.list_objects_v2(Bucket=bucket, MaxKeys=0)
        endpoint = settings.OBJECT_STORAGE_ENDPOINT_URL
        return True, f"connected to {endpoint}; probed {label} bucket '{bucket}'"

    def _check_object_storage_buckets(self):
        from apps.contests.services.anticheat_storage import get_s3_client

        client = get_s3_client()
        required = self._configured_object_storage_buckets()
        if not required:
            return False, "no object storage buckets configured"

        for _label, bucket in required:
            client.head_bucket(Bucket=bucket)

        bucket_names = ", ".join(bucket for _label, bucket in required)
        return True, f"buckets reachable: {bucket_names}"

    def _configured_object_storage_buckets(self):
        raw_buckets = [
            ("anticheat_raw", getattr(settings, "ANTICHEAT_RAW_BUCKET", "")),
            ("markdown_images", getattr(settings, "MARKDOWN_IMAGE_S3_BUCKET", "")),
            ("ai_artifacts", getattr(settings, "AI_ARTIFACT_S3_BUCKET", "")),
        ]
        buckets = []
        seen = set()
        for label, bucket in raw_buckets:
            bucket_name = (bucket or "").strip()
            if not bucket_name or bucket_name in seen:
                continue
            buckets.append((label, bucket_name))
            seen.add(bucket_name)
        return buckets

    def _check_celery_default(self):
        queue_name = getattr(settings, "CELERY_TASK_DEFAULT_QUEUE", "celery")
        return self._ping_celery_queue(queue_name)

    def _ping_celery_queue(self, queue_name):
        from config.celery import app as celery_app

        inspector = celery_app.control.inspect(timeout=3.0)
        active_queues = inspector.active_queues() or {}

        for worker_name, queues in active_queues.items():
            for q in queues:
                if q.get("name") == queue_name:
                    return True, f"worker={worker_name}"

        active_queue_names = sorted(
            {
                q.get("name")
                for queues in active_queues.values()
                for q in queues
                if q.get("name")
            }
        )
        active_detail = ", ".join(active_queue_names) if active_queue_names else "none"
        return False, f"no worker consuming '{queue_name}' (active: {active_detail})"

    def _check_celery_beat(self):
        """Check beat scheduler — best-effort, non-fatal if unreachable."""
        from config.celery import app as celery_app

        inspector = celery_app.control.inspect(timeout=3.0)
        scheduled = inspector.scheduled() or {}
        if scheduled:
            worker = next(iter(scheduled))
            return True, f"scheduler reachable via {worker}"

        # Fallback: check if any periodic task ran recently via DB
        try:
            from django_celery_beat.models import PeriodicTask  # type: ignore
            from django.utils import timezone as tz
            from datetime import timedelta

            recent = PeriodicTask.objects.filter(
                enabled=True,
                last_run_at__gte=tz.now() - timedelta(minutes=10),
            ).first()
            if recent:
                return True, f"task '{recent.name}' ran at {recent.last_run_at}"
        except Exception:
            pass

        return True, "beat not verified (non-blocking)"
