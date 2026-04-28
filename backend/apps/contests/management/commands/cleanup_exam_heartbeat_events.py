from django.core.management.base import BaseCommand, CommandError

from apps.contests.models import ExamEvent


class Command(BaseCommand):
    help = "Delete legacy ExamEvent rows whose event_type is heartbeat."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually delete rows. Without this flag the command only reports the count.",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=1000,
            help="Number of heartbeat rows to delete per batch.",
        )
        parser.add_argument(
            "--contest-id",
            help="Limit cleanup to one contest id.",
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        batch_size = options["batch_size"]
        contest_id = options.get("contest_id")

        if batch_size < 1:
            raise CommandError("--batch-size must be greater than zero")

        queryset = ExamEvent.objects.filter(event_type="heartbeat").order_by("id")
        if contest_id:
            queryset = queryset.filter(contest_id=contest_id)

        total = queryset.count()
        scope = f"contest_id={contest_id}" if contest_id else "scope=all"
        if not apply_changes:
            self.stdout.write(
                self.style.WARNING(
                    f"dry_run=True {scope} heartbeat_events={total} deleted=0"
                )
            )
            return

        deleted = 0
        while True:
            ids = list(queryset.values_list("id", flat=True)[:batch_size])
            if not ids:
                break
            batch_deleted, _ = ExamEvent.objects.filter(id__in=ids).delete()
            deleted += batch_deleted
            self.stdout.write(f"deleted_batch={batch_deleted} deleted_total={deleted}")

        self.stdout.write(
            self.style.SUCCESS(
                f"dry_run=False {scope} heartbeat_events={total} deleted={deleted}"
            )
        )
