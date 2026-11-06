"""Dev fixtures for checking the student exam shell in every state.

Copies one real paper exam and one real coding contest into eight contests,
one per exam type and student state (before, during, after, published), for
the seed student. Re-running replaces the previous set, with times relative to
now, so "during" is always inside its window. Prints the URLs as JSON.

    python manage.py seed_exam_shell_states [--paper <contest id>] [--coding <contest id>]
"""
import json
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from apps.classrooms.models import Classroom, ClassroomContest
from apps.contests.models import (
    Contest,
    ContestParticipant,
    ExamAnswer,
    ExamQuestion,
    ExamQuestionGroup,
)
from apps.question_bank.models import ContestQuestionBinding
from apps.submissions.models import Submission

User = get_user_model()

PREFIX = "[狀態] "
CLASSROOM = "E2E Test Classroom"
STUDENT = "student@example.com"
STATES = ("before", "during", "after", "published")
STATE_LABELS = {"before": "考前", "during": "考中", "after": "考後", "published": "成績公布後"}
TYPE_LABELS = {"paper_exam": "考卷", "coding": "程式"}
SKIP = {"id", "contest", "group", "exam_question", "created_at", "updated_at"}


def copy_fields(obj, skip=SKIP):
    return {f.name: getattr(obj, f.name) for f in obj._meta.fields if f.name not in skip}


class Command(BaseCommand):
    help = "Create eight dev contests covering each exam type and student state."

    def add_arguments(self, parser):
        parser.add_argument("--paper", help="Source paper exam id (default: largest published paper exam).")
        parser.add_argument("--coding", help="Source coding contest id (default: coding contest with most problems).")

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Dev only: this command deletes and recreates contests.")
        student = User.objects.get(email=STUDENT)
        owner = User.objects.filter(is_superuser=True).order_by("id").first() or student
        classroom = Classroom.objects.get(name=CLASSROOM)
        sources = {
            "paper_exam": self._source(options["paper"], "paper_exam"),
            "coding": self._source(options["coding"], "coding"),
        }

        with transaction.atomic():
            self._clear()
            result = {"classroom": str(classroom.uuid), "contests": {}}
            for contest_type, source in sources.items():
                stand_in = self._stand_in(source)
                for state in STATES:
                    contest = self._clone(source, contest_type, state, owner, classroom, stand_in, student)
                    result["contests"][f"{contest_type}:{state}"] = str(contest.id)
        self.stdout.write(json.dumps(result, ensure_ascii=False))

    # ---------- sources ----------

    def _source(self, contest_id, contest_type):
        if contest_id:
            return Contest.objects.get(id=contest_id, contest_type=contest_type)
        candidates = Contest.objects.filter(contest_type=contest_type).exclude(name__startswith=PREFIX)
        if contest_type == "paper_exam":
            candidates = candidates.filter(results_published=True).annotate(n=Count("exam_questions"))
        else:
            candidates = candidates.annotate(n=Count("question_bindings"))
        source = candidates.filter(n__gt=0).order_by("-n").first()
        if not source:
            raise CommandError(f"No {contest_type} contest to copy; pass --{contest_type.split('_')[0]}.")
        return source

    def _stand_in(self, source):
        """The participant whose work the seed student takes over: the median one."""
        participants = list(ContestParticipant.objects.filter(contest=source).select_related("user"))
        if not participants:
            raise CommandError(f"{source.name} has no participants to copy.")
        if source.contest_type == "paper_exam":
            totals = {p.id: sum((a.score or 0) for a in p.exam_answers.all()) for p in participants}
        else:
            solved = dict(
                Submission.objects.filter(contest=source, status="AC")
                .values("user").annotate(n=Count("problem", distinct=True)).values_list("user", "n")
            )
            totals = {p.id: solved.get(p.user_id, 0) for p in participants}
        ranked = sorted(participants, key=lambda p: totals[p.id])
        return ranked[len(ranked) // 2]

    # ---------- fixtures ----------

    def _clear(self):
        old = Contest.objects.filter(name__startswith=PREFIX)
        # Submissions only lose their contest on delete; remove them so they do not linger as practice.
        Submission.objects.filter(contest__in=old).delete()
        old.delete()

    def _clone(self, source, contest_type, state, owner, classroom, stand_in, student):
        now = timezone.now()
        window = {
            "before": (now + timedelta(days=2), now + timedelta(days=2, hours=3)),
            "during": (now - timedelta(minutes=30), now + timedelta(hours=2)),
            "after": (now - timedelta(days=1, hours=3), now - timedelta(days=1)),
            "published": (now - timedelta(days=7, hours=3), now - timedelta(days=7)),
        }[state]
        contest = Contest.objects.create(**{
            **copy_fields(source, {"id", "created_at", "updated_at", "owner", "schedule_revision"}),
            "name": f"{PREFIX}{TYPE_LABELS[contest_type]} · {STATE_LABELS[state]}",
            "owner": owner,
            "status": "published",
            "start_time": window[0],
            "end_time": window[1],
            "results_published": state == "published",
            # Headless browsers cannot grant camera or screen capture, so answering runs unproctored.
            "cheat_detection_enabled": source.cheat_detection_enabled and state != "during",
            "webcam_required": source.webcam_required and state != "during",
        })
        ClassroomContest.objects.create(classroom=classroom, contest=contest)
        questions, bindings = self._copy_paper(source, contest)

        if state == "before":
            return contest
        # Published results need the whole class for the average and distribution.
        participants = (
            ContestParticipant.objects.filter(contest=source).select_related("user")
            if state == "published" else [stand_in]
        )
        for participant in participants:
            user = student if participant.id == stand_in.id else participant.user
            new = ContestParticipant.objects.create(
                contest=contest, user=user,
                exam_status="in_progress" if state == "during" else "submitted",
                started_at=window[0] + timedelta(minutes=5),
                left_at=None if state == "during" else window[1] - timedelta(minutes=10),
            )
            if contest_type == "paper_exam":
                self._copy_answers(participant, new, questions, partial=state == "during")
            else:
                self._copy_submissions(source, contest, participant.user, user, bindings, partial=state == "during")
        return contest

    def _copy_paper(self, source, contest):
        groups = {
            group.id: ExamQuestionGroup.objects.create(contest=contest, **copy_fields(group))
            for group in source.exam_question_groups.all()
        }
        questions = {
            question.id: ExamQuestion.objects.create(contest=contest, group=groups.get(question.group_id), **copy_fields(question))
            for question in source.exam_questions.all()
        }
        bindings = {}
        for binding in ContestQuestionBinding.objects.filter(contest=source):
            bindings[binding.id] = ContestQuestionBinding.objects.create(
                contest=contest, exam_question=questions.get(binding.exam_question_id), **copy_fields(binding),
            )
        return questions, bindings

    def _copy_answers(self, source_participant, participant, questions, partial):
        answers = list(source_participant.exam_answers.order_by("question__order"))
        if partial:
            # Mid-exam: about two thirds answered, nothing graded yet.
            answers = answers[: max(1, len(answers) * 2 // 3)]
        ExamAnswer.objects.bulk_create([
            ExamAnswer(
                participant=participant, question=questions[answer.question_id], answer=answer.answer,
                is_correct=None if partial else answer.is_correct,
                score=None if partial else answer.score,
                feedback="" if partial else answer.feedback,
                graded_by=None if partial else answer.graded_by,
                graded_at=None if partial else answer.graded_at,
            )
            for answer in answers if answer.question_id in questions
        ])

    def _copy_submissions(self, source, contest, source_user, user, bindings, partial):
        submissions = Submission.objects.filter(contest=source, user=source_user).order_by("created_at")
        if partial:
            # Mid-exam: work on the first half of the problems only.
            problems = list(
                ContestQuestionBinding.objects.filter(contest=source).exclude(coding_problem=None)
                .order_by("order").values_list("coding_problem_id", flat=True)
            )
            submissions = submissions.filter(problem_id__in=problems[: max(1, len(problems) // 2)])
        Submission.objects.bulk_create([
            Submission(
                **copy_fields(submission, {"id", "user", "contest", "contest_question_binding", "created_at", "updated_at"}),
                user=user, contest=contest,
                contest_question_binding=bindings.get(submission.contest_question_binding_id),
            )
            for submission in submissions
        ])
