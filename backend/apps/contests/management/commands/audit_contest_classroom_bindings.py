"""
Read-only audit: exit with error if any Contest has no ClassroomContest binding.
"""
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count

from apps.contests.models import Contest


class Command(BaseCommand):
    help = "Fail if any contest has zero classroom bindings (deploy / CI guard)."

    def handle(self, *args, **options):
        orphans = (
            Contest.objects.annotate(_bc=Count("classroom_bindings"))
            .filter(_bc=0)
            .values_list("id", "name", named=True)
        )
        rows = list(orphans)
        if not rows:
            self.stdout.write(self.style.SUCCESS("All contests have at least one classroom binding."))
            return

        self.stdout.write(self.style.ERROR(f"{len(rows)} contest(s) without classroom binding:"))
        for row in rows:
            self.stdout.write(f"  {row.id}  {row.name}")
        raise CommandError("Unbound contests found — bind via classroom or archive.")
