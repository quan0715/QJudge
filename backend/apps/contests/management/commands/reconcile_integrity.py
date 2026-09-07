import json
import time

from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections
from django.utils import timezone

from apps.contests.services.exam_schedule import reconcile_integrity_once


class Command(BaseCommand):
    help = (
        "Reconcile resident sessions and enforce current exam deadlines. "
        "Requires a direct or session-pooled PostgreSQL connection for advisory "
        "ownership; transaction pooling is unsupported. Main/dev use DB_HOST "
        "(not POSTGRES_HOST); prefer DB_HOST=postgres for this process. "
        "Test settings prefer DATABASE_URL, then POSTGRES_HOST over DB_HOST."
    )

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true")
        parser.add_argument("--interval", type=float, default=10)

    def handle(self, *args, **options):
        if options["interval"] <= 0:
            raise CommandError("interval must be positive")
        try:
            while True:
                close_old_connections()
                self.stdout.write(json.dumps(reconcile_integrity_once(timezone.now())))
                if options["once"]:
                    return
                time.sleep(options["interval"])
        except KeyboardInterrupt:
            return
