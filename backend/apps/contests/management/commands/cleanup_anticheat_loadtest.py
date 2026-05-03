from __future__ import annotations

from itertools import islice

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from apps.contests.models import Contest, ContestParticipant, ExamAnswer, ExamEvent, ExamEvidenceFrame, ExamStatus
from apps.contests.services.anti_cheat_session import clear_active_session, clear_exam_allowed_jti, clear_heartbeat
from apps.submissions.models import Submission
from apps.contests.services.anticheat_storage import get_s3_client
from django.conf import settings


def _chunks(iterable, size):
    iterator = iter(iterable)
    while True:
        chunk = list(islice(iterator, size))
        if not chunk:
            break
        yield chunk


class Command(BaseCommand):
    help = "Clean up anti-cheat production load-test events, evidence rows, storage objects, and optional test users."

    def add_arguments(self, parser):
        parser.add_argument("--run-id", required=True, help="Load-test run id stored in event metadata.")
        parser.add_argument(
            "--contest-id",
            action="append",
            default=[],
            help="Contest id to include. Can be passed multiple times.",
        )
        parser.add_argument(
            "--user-prefix",
            default="loadtest_student_",
            help="Username prefix to delete when --delete-users is provided.",
        )
        parser.add_argument(
            "--delete-users",
            action="store_true",
            help="Also delete users whose username starts with --user-prefix.",
        )
        parser.add_argument(
            "--exclude-username",
            action="append",
            default=["lt_teacher", "loadtest_teacher"],
            help="Username to keep when deleting by prefix. Can be passed multiple times.",
        )
        parser.add_argument(
            "--keep-contests",
            action="store_true",
            help="Keep load-test contests; delete only matching runtime rows.",
        )
        parser.add_argument(
            "--allow-non-loadtest-contest",
            action="store_true",
            help="Allow --contest-id to delete a contest whose name does not start with LOADTEST_.",
        )
        parser.add_argument(
            "--skip-storage",
            action="store_true",
            help="Do not delete object storage keys. Use only for dry investigations.",
        )
        parser.add_argument(
            "--confirm",
            action="store_true",
            help="Actually delete data. Without this flag the command is dry-run only.",
        )

    def handle(self, *args, **options):
        run_id = str(options["run_id"]).strip()
        if not run_id:
            raise CommandError("--run-id is required")

        contest_ids = [str(value).strip() for value in options["contest_id"] if str(value).strip()]
        confirm = bool(options["confirm"])
        keep_contests = bool(options["keep_contests"])
        allow_non_loadtest_contest = bool(options["allow_non_loadtest_contest"])
        skip_storage = bool(options["skip_storage"])
        delete_users = bool(options["delete_users"])
        user_prefix = str(options["user_prefix"]).strip()
        excluded_usernames = [str(value).strip() for value in options["exclude_username"] if str(value).strip()]

        events_q = Q(metadata__loadtest_run_id=run_id) | Q(metadata__run_id=run_id)
        frames_q = (
            Q(upload_session_id__startswith=f"loadtest_{run_id}")
            | Q(exam_event__metadata__loadtest_run_id=run_id)
            | Q(exam_event__metadata__run_id=run_id)
            | Q(metadata__loadtest_run_id=run_id)
        )
        contests_q = Q(name__startswith="LOADTEST_", name__icontains=run_id)
        if contest_ids:
            events_q |= Q(contest_id__in=contest_ids)
            frames_q |= Q(contest_id__in=contest_ids)
            if allow_non_loadtest_contest:
                contests_q |= Q(id__in=contest_ids)
            else:
                contests_q &= Q(id__in=contest_ids)

        contests = Contest.objects.filter(contests_q)
        contest_ids_for_delete = list(contests.values_list("id", flat=True))
        if contest_ids_for_delete:
            events_q |= Q(contest_id__in=contest_ids_for_delete)
            frames_q |= Q(contest_id__in=contest_ids_for_delete)

        events = ExamEvent.objects.filter(events_q)
        frames = ExamEvidenceFrame.objects.filter(frames_q)
        runtime_contest_ids = set(contest_ids) | {str(contest_id) for contest_id in contest_ids_for_delete}
        runtime_pairs = set(events.values_list("contest_id", "user_id").distinct())
        runtime_pairs.update(frames.values_list("contest_id", "user_id").distinct())

        participants_q = Q()
        if runtime_contest_ids:
            participants_q |= Q(contest_id__in=runtime_contest_ids)
        for contest_id, user_id in runtime_pairs:
            participants_q |= Q(contest_id=contest_id, user_id=user_id)
        participants = ContestParticipant.objects.filter(participants_q) if participants_q else ContestParticipant.objects.none()
        participant_ids = list(participants.values_list("id", flat=True))
        participant_user_ids = list(participants.values_list("user_id", flat=True).distinct())
        answers = ExamAnswer.objects.filter(participant_id__in=participant_ids)
        submissions = Submission.objects.filter(contest_id__in=runtime_contest_ids, user_id__in=participant_user_ids)
        users = get_user_model().objects.none()
        if delete_users:
            if not user_prefix:
                raise CommandError("--user-prefix cannot be blank when --delete-users is used")
            users = get_user_model().objects.filter(username__startswith=user_prefix)
            if excluded_usernames:
                users = users.exclude(username__in=excluded_usernames)

        object_keys = list(
            frames.exclude(object_key="")
            .values_list("object_key", flat=True)
            .distinct()
        )

        self.stdout.write(
            "cleanup_anticheat_loadtest "
            f"run_id={run_id} dry_run={not confirm} "
            f"contests={contests.count()} events={events.count()} "
            f"frames={frames.count()} objects={len(object_keys)} "
            f"answers={answers.count()} submissions={submissions.count()} "
            f"participants_to_reset={participants.count()} users={users.count()}"
        )

        if not confirm:
            self.stdout.write(self.style.WARNING("Dry run only. Re-run with --confirm to delete."))
            return

        deleted_objects = 0
        storage_errors = 0
        if not skip_storage and object_keys:
            client = get_s3_client()
            for chunk in _chunks(object_keys, 1000):
                try:
                    result = client.delete_objects(
                        Bucket=settings.ANTICHEAT_RAW_BUCKET,
                        Delete={"Objects": [{"Key": key} for key in chunk], "Quiet": True},
                    )
                    deleted_objects += len(chunk) - len(result.get("Errors", []))
                    storage_errors += len(result.get("Errors", []))
                except Exception as exc:  # noqa: BLE001 - cleanup command must continue to report partial failure
                    storage_errors += len(chunk)
                    self.stderr.write(f"storage delete failed for {len(chunk)} objects: {exc}")

        with transaction.atomic():
            deleted_answers = answers.delete()[0]
            deleted_submissions = submissions.delete()[0]
            if keep_contests:
                deleted_frames = frames.delete()[0]
                deleted_events = events.delete()[0]
                deleted_contests = 0
                reset_participants = participants.update(
                    score=0,
                    rank=None,
                    started_at=None,
                    left_at=None,
                    locked_at=None,
                    lock_reason="",
                    violation_count=0,
                    submit_reason="",
                    exam_status=ExamStatus.NOT_STARTED,
                )
            else:
                deleted_contests = contests.delete()[0]
                deleted_frames = frames.exclude(contest__in=contests).delete()[0]
                deleted_events = events.exclude(contest__in=contests).delete()[0]
                reset_participants = 0

            deleted_users = users.delete()[0] if delete_users else 0

        cleared_session_keys = 0
        for contest_id, user_id in set(participants.values_list("contest_id", "user_id")) | runtime_pairs:
            clear_active_session(contest_id, user_id)
            clear_heartbeat(contest_id, user_id)
            clear_exam_allowed_jti(user_id, contest_id)
            cleared_session_keys += 3

        self.stdout.write(
            self.style.SUCCESS(
                "cleanup complete "
                f"deleted_objects={deleted_objects} storage_errors={storage_errors} "
                f"deleted_contest_rows={deleted_contests} "
                f"deleted_frame_rows={deleted_frames} "
                f"deleted_event_rows={deleted_events} "
                f"deleted_answer_rows={deleted_answers} "
                f"deleted_submission_rows={deleted_submissions} "
                f"reset_participant_rows={reset_participants} "
                f"cleared_session_keys={cleared_session_keys} "
                f"deleted_user_rows={deleted_users}"
            )
        )
