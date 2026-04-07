"""
Management command to seed load-test data.
Creates 200 student accounts, 1 teacher, 1 exam contest with coding + paper questions,
and pre-registers all 200 students as participants.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta

from apps.users.models import UserProfile
from apps.problems.models import Problem, TestCase, ProblemTranslation, LanguageConfig
from apps.contests.models import (
    Contest, ContestProblem, ContestParticipant, ExamQuestion, ExamAnswer, ExamEvent, ExamStatus,
)
from apps.submissions.models import Submission

User = get_user_model()

NUM_STUDENTS = 200
STUDENT_PASSWORD = "loadtest123"
TEACHER_USERNAME = "lt_teacher"
TEACHER_PASSWORD = "loadtest123"
CONTEST_NAME = "Load Test Exam"
CODING_CONTEST_NAME = "Load Test Coding"


class Command(BaseCommand):
    help = "Seed load-test data: 200 students, 1 teacher, 1 exam contest"

    def handle(self, *args, **options):
        self.stdout.write("=== Seeding load-test data ===")
        teacher = self._create_teacher()
        self._create_students()
        self._create_problems(teacher)
        paper_contest, coding_contest = self._create_contests(teacher)
        self._reset_contest_runtime_data(paper_contest)
        self._register_participants(paper_contest)
        self._reset_contest_runtime_data(coding_contest)
        self._register_participants(coding_contest)
        self.stdout.write(self.style.SUCCESS("=== Load-test seed complete ==="))

    # ------------------------------------------------------------------
    # Users
    # ------------------------------------------------------------------
    def _create_teacher(self):
        user, created = User.objects.get_or_create(
            username=TEACHER_USERNAME,
            defaults={
                "email": "lt_teacher@test.com",
                "role": "teacher",
            },
        )
        user.set_password(TEACHER_PASSWORD)
        user.email = "lt_teacher@test.com"
        user.role = "teacher"
        user.save()
        UserProfile.objects.get_or_create(user=user)
        self.stdout.write(f"  {'Created' if created else 'Updated'} teacher: {TEACHER_USERNAME}")
        return user

    def _create_students(self):
        self.stdout.write(f"Creating {NUM_STUDENTS} student accounts ...")
        for i in range(1, NUM_STUDENTS + 1):
            username = f"lt_{i:03d}"
            email = f"lt_{i:03d}@test.com"
            user, created = User.objects.get_or_create(
                username=username,
                defaults={"email": email, "role": "student"},
            )
            if created:
                user.set_password(STUDENT_PASSWORD)
                user.save()
                UserProfile.objects.get_or_create(user=user)
            else:
                # Ensure password is up-to-date
                user.set_password(STUDENT_PASSWORD)
                user.email = email
                user.role = "student"
                user.save()
        self.stdout.write(self.style.SUCCESS(f"  {NUM_STUDENTS} students ready"))

    # ------------------------------------------------------------------
    # Problems (reuse titles from seed_e2e_data when they exist)
    # ------------------------------------------------------------------
    def _create_problems(self, teacher):
        self.stdout.write("Ensuring coding problems exist ...")
        admin = User.objects.filter(is_superuser=True).first() or teacher

        problems_spec = [
            {
                "title": "A+B Problem",
                "slug": "a-plus-b",
                "difficulty": "easy",
                "order": 1,
                "tests": [("1 2", "3", True, 30), ("10 20", "30", False, 30), ("-100 100", "0", False, 40)],
                "template": '#include <iostream>\nusing namespace std;\nint main(){int a,b;cin>>a>>b;cout<<a+b<<endl;}',
            },
            {
                "title": "Hello World",
                "slug": "hello-world",
                "difficulty": "easy",
                "order": 2,
                "tests": [("", "Hello, World!", True, 100)],
                "template": '#include <iostream>\nusing namespace std;\nint main(){cout<<"Hello, World!"<<endl;}',
            },
            {
                "title": "Factorial",
                "slug": "factorial",
                "difficulty": "medium",
                "order": 3,
                "tests": [("5", "120", True, 50), ("0", "1", False, 25), ("10", "3628800", False, 25)],
                "template": '#include <iostream>\nusing namespace std;\nint main(){int n;cin>>n;int r=1;for(int i=2;i<=n;i++)r*=i;cout<<r<<endl;}',
            },
        ]

        for spec in problems_spec:
            prob, created = Problem.objects.get_or_create(
                title=spec["title"],
                defaults={
                    "slug": spec["slug"],
                    "difficulty": spec["difficulty"],
                    "time_limit": 1000,
                    "memory_limit": 128,
                    "created_by": admin,
                    "visibility": "private",
                    "order": spec["order"],
                },
            )
            if created:
                ProblemTranslation.objects.create(
                    problem=prob, language="zh-TW",
                    title=spec["title"], description=f"{spec['title']} 壓測用",
                    input_description="", output_description="",
                )
                for idx, (inp, out, sample, score) in enumerate(spec["tests"]):
                    TestCase.objects.create(
                        problem=prob, input_data=inp, output_data=out,
                        is_sample=sample, is_hidden=not sample, score=score, order=idx + 1,
                    )
                LanguageConfig.objects.create(
                    problem=prob, language="cpp", is_enabled=True,
                    template_code=spec["template"],
                )
            self.stdout.write(f"  {'Created' if created else 'Exists'}: {spec['title']}")

    # ------------------------------------------------------------------
    # Contest + exam questions
    # ------------------------------------------------------------------
    def _create_contests(self, teacher):
        now = timezone.now()
        paper_contest, _ = Contest.objects.get_or_create(
            name=CONTEST_NAME,
            defaults={
                "description": "200-user load test exam",
                "start_time": now - timedelta(hours=1),
                "end_time": now + timedelta(hours=3),
                "owner": teacher,
                "visibility": "public",
                "status": "published",
                "contest_type": "paper_exam",
                "cheat_detection_enabled": True,
                "max_cheat_warnings": 10,
                "allow_auto_unlock": False,
                "scoreboard_visible_during_contest": True,
            },
        )

        coding_contest, _ = Contest.objects.get_or_create(
            name=CODING_CONTEST_NAME,
            defaults={
                "description": "200-user load test coding contest",
                "start_time": now - timedelta(hours=1),
                "end_time": now + timedelta(hours=3),
                "owner": teacher,
                "visibility": "public",
                "status": "published",
                "contest_type": "coding",
                "cheat_detection_enabled": False,
                "max_cheat_warnings": 10,
                "allow_auto_unlock": False,
                "scoreboard_visible_during_contest": True,
            },
        )

        # Always refresh times so contests stay active
        for contest in (paper_contest, coding_contest):
            contest.start_time = now - timedelta(hours=1)
            contest.end_time = now + timedelta(hours=3)
            contest.save(update_fields=["start_time", "end_time"])

        # Attach coding problems
        for idx, title in enumerate(["A+B Problem", "Hello World", "Factorial"]):
            prob = Problem.objects.filter(title=title).first()
            if prob:
                ContestProblem.objects.get_or_create(contest=paper_contest, problem=prob, defaults={"order": idx})
                ContestProblem.objects.get_or_create(contest=coding_contest, problem=prob, defaults={"order": idx})

        # Paper exam questions
        paper_questions = [
            {"order": 0, "question_type": "single_choice", "prompt": "1 + 1 = ?",
             "options": ["1", "2", "3", "4"], "correct_answer": "2", "score": 10},
            {"order": 1, "question_type": "true_false", "prompt": "Python is a programming language.",
             "options": ["True", "False"], "correct_answer": "True", "score": 10},
            {"order": 2, "question_type": "single_choice", "prompt": "Which is O(n log n)?",
             "options": ["Bubble Sort", "Merge Sort", "Insertion Sort", "Selection Sort"],
             "correct_answer": "Merge Sort", "score": 10},
            {"order": 3, "question_type": "true_false", "prompt": "HTTP is stateful.",
             "options": ["True", "False"], "correct_answer": "False", "score": 10},
            {"order": 4, "question_type": "short_answer", "prompt": "What does CPU stand for?",
             "options": [], "correct_answer": "Central Processing Unit", "score": 10},
        ]
        for q in paper_questions:
            ExamQuestion.objects.get_or_create(
                contest=paper_contest, order=q["order"],
                defaults={k: v for k, v in q.items() if k != "order"},
            )

        self.stdout.write(self.style.SUCCESS(
            f"  Contest '{CONTEST_NAME}' ready (id={paper_contest.id})"
        ))
        self.stdout.write(self.style.SUCCESS(
            f"  Contest '{CODING_CONTEST_NAME}' ready (id={coding_contest.id})"
        ))
        return paper_contest, coding_contest

    # ------------------------------------------------------------------
    # Pre-register all students
    # ------------------------------------------------------------------
    def _reset_contest_runtime_data(self, contest):
        """
        Make load tests repeatable by clearing prior runtime artifacts.
        """
        participants_qs = ContestParticipant.objects.filter(contest=contest)
        participant_ids = list(participants_qs.values_list("id", flat=True))

        if participant_ids:
            ExamAnswer.objects.filter(participant_id__in=participant_ids).delete()
            Submission.objects.filter(contest=contest, user_id__in=participants_qs.values_list("user_id", flat=True)).delete()
        ExamEvent.objects.filter(contest=contest).delete()

        updated = participants_qs.update(
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
        self.stdout.write(self.style.SUCCESS(
            f"  Reset runtime state for {updated} existing participants"
        ))

    def _register_participants(self, contest):
        self.stdout.write("Registering participants ...")
        students = User.objects.filter(username__startswith="lt_").exclude(username=TEACHER_USERNAME)
        existing = set(
            ContestParticipant.objects.filter(contest=contest).values_list("user_id", flat=True)
        )
        new_participants = []
        for student in students:
            if student.id not in existing:
                new_participants.append(
                    ContestParticipant(contest=contest, user=student, nickname=student.username)
                )
        if new_participants:
            ContestParticipant.objects.bulk_create(new_participants, ignore_conflicts=True)
        self.stdout.write(self.style.SUCCESS(
            f"  {len(new_participants)} new + {len(existing)} existing participants"
        ))
