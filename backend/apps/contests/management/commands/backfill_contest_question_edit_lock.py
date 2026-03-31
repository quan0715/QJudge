"""Backfill contest question edit lock from historical student formal activity."""
from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.contests.models import Contest, ExamAnswer
from apps.contests.permissions import can_manage_contest
from apps.contests.services.question_edit_lock import is_non_empty_exam_answer
from apps.submissions.models import Submission


class Command(BaseCommand):
    help = "Backfill Contest.question_edit_locked from historical student submissions/answers (idempotent)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview backfill results without writing DB",
        )
        parser.add_argument(
            "--contest-id",
            type=str,
            default="",
            help="Optional contest UUID to backfill only one contest",
        )

    def handle(self, *args, **options):
        dry_run: bool = bool(options.get("dry_run"))
        contest_id: str = (options.get("contest_id") or "").strip()

        contests = Contest.objects.all().order_by("created_at")
        if contest_id:
            contests = contests.filter(id=contest_id)

        stats = {
            "total": 0,
            "already_locked": 0,
            "backfilled": 0,
            "would_backfill": 0,
            "no_signal": 0,
        }

        for contest in contests:
            stats["total"] += 1
            if contest.question_edit_locked:
                stats["already_locked"] += 1
                continue

            signal = self._find_first_lock_signal(contest)
            if signal is None:
                stats["no_signal"] += 1
                continue

            trigger, locked_at = signal
            if dry_run:
                stats["would_backfill"] += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"[DRY-RUN] contest={contest.id} trigger={trigger} locked_at={locked_at.isoformat()}"
                    )
                )
                continue

            Contest.objects.filter(id=contest.id, question_edit_locked=False).update(
                question_edit_locked=True,
                question_edit_locked_at=locked_at,
                question_edit_lock_trigger=trigger,
            )
            stats["backfilled"] += 1
            self.stdout.write(
                self.style.SUCCESS(
                    f"Backfilled contest={contest.id} trigger={trigger} locked_at={locked_at.isoformat()}"
                )
            )

        self.stdout.write("")
        self.stdout.write("=== Backfill Report ===")
        self.stdout.write(f"total={stats['total']}")
        self.stdout.write(f"already_locked={stats['already_locked']}")
        self.stdout.write(f"backfilled={stats['backfilled']}")
        self.stdout.write(f"would_backfill={stats['would_backfill']}")
        self.stdout.write(f"no_signal={stats['no_signal']}")

    def _find_first_lock_signal(self, contest: Contest):
        coding_signal = None
        coding_qs = (
            Submission.objects.filter(
                contest=contest,
                source_type="contest",
                is_test=False,
            )
            .select_related("user")
            .order_by("created_at")
        )
        for submission in coding_qs:
            if can_manage_contest(submission.user, contest):
                continue
            coding_signal = (
                Contest.QuestionEditLockTrigger.CODING_SUBMISSION,
                submission.created_at,
            )
            break

        exam_signal = None
        exam_qs = (
            ExamAnswer.objects.filter(participant__contest=contest)
            .select_related("participant__user")
            .order_by("created_at")
        )
        for answer in exam_qs:
            if can_manage_contest(answer.participant.user, contest):
                continue
            if not is_non_empty_exam_answer(answer.answer):
                continue
            exam_signal = (
                Contest.QuestionEditLockTrigger.EXAM_ANSWER,
                answer.created_at,
            )
            break

        if coding_signal and exam_signal:
            return coding_signal if coding_signal[1] <= exam_signal[1] else exam_signal
        return coding_signal or exam_signal
