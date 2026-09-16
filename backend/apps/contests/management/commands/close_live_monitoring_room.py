"""Explicit, scoped cleanup for one self-hosted LiveKit exam room."""

import json

from django.core.management.base import BaseCommand, CommandError

from apps.contests.models import Contest, ExamIntegrityRun
from apps.contests.services.livekit_service import (
    close_live_room,
    get_livekit_config,
    live_room_name_for_run,
    set_live_cleanup_warning,
)


class Command(BaseCommand):
    help = "Delete the LiveKit room belonging to one QJudge Integrity Run."

    def add_arguments(self, parser):
        parser.add_argument("--contest-id", required=True)
        parser.add_argument("--run-id", required=True)
        parser.add_argument("--confirm", action="store_true")

    def handle(self, *args, **options):
        contest = Contest.objects.filter(pk=options["contest_id"]).first()
        if contest is None:
            raise CommandError("contest was not found")
        run = ExamIntegrityRun.objects.filter(pk=options["run_id"]).first()
        if run is None:
            raise CommandError("run was not found")
        if str(run.contest_id) != str(contest.pk):
            raise CommandError("run does not belong to contest")

        config = get_livekit_config()
        room_name = live_room_name_for_run(run)
        if not options["confirm"]:
            self.stdout.write(json.dumps({
                "dry_run": True,
                "contest_id": str(contest.pk),
                "run_id": str(run.pk),
                "room_name": room_name,
                "configured": config.configured,
            }))
            return

        if not config.enabled:
            self.stdout.write(json.dumps({
                "closed": False,
                "reason": "live_monitoring_disabled",
                "run_id": str(run.pk),
                "room_name": room_name,
            }))
            return
        if not config.configured:
            set_live_cleanup_warning(run.pk, pending=True)
            raise CommandError("LiveKit is enabled but not configured; cleanup is pending")
        if not close_live_room(room_name):
            set_live_cleanup_warning(run.pk, pending=True)
            raise CommandError("LiveKit room cleanup is pending")
        set_live_cleanup_warning(run.pk, pending=False)
        self.stdout.write(json.dumps({
            "closed": True,
            "run_id": str(run.pk),
            "room_name": room_name,
        }))
