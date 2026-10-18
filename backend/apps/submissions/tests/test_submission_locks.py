"""PostgreSQL lock semantics of contest submission creation.

Submissions share the Contest and live-run locks, so they never queue behind
each other, while schedule edits and deadline finalization still exclude them.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from queue import Queue
from time import monotonic, sleep

import pytest
from django.db import close_old_connections, connection, transaction
from django.utils import timezone

from apps.contests.models import Contest, ContestParticipant, ExamIntegrityRun
from apps.contests.services.exam_schedule import finalize_due_exam, update_exam_schedule
from apps.contests.services.integrity_sessions import ensure_resident_session
from apps.problems.models import CodingProblem
from apps.question_bank.models import ContestQuestionBinding, QuestionAsset
from apps.submissions.access_policy import SubmissionAccessError
from apps.submissions.models import Submission
from apps.submissions.services import SubmissionService
from apps.users.models import User

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture
def contest():
    owner = User.objects.create_user(username="lock-owner", email="lock-owner@example.com", role="teacher")
    now = timezone.now()
    contest = Contest.objects.create(name="Locks", owner=owner, status="published", contest_type="coding",
                                     cheat_detection_enabled=True, start_time=now - timedelta(hours=1),
                                     end_time=now + timedelta(minutes=10))
    assert ensure_resident_session(contest.pk) is not None
    return contest


@pytest.fixture
def problem(contest):
    asset = QuestionAsset.objects.create(owner=contest.owner, asset_type="coding", title="Lock", prompt="p", payload={})
    problem = CodingProblem.objects.create(slug="lock", created_by=contest.owner, question_asset=asset)
    ContestQuestionBinding.objects.create(contest=contest, coding_problem=problem, question_asset=asset,
                                          binding_type="coding", score=100, order=1, created_by=contest.owner)
    return problem


@pytest.fixture
def students(contest):
    users = [User.objects.create_user(username=f"lock-student-{i}", email=f"lock-student-{i}@example.com",
                                      role="student") for i in range(2)]
    for user in users:
        ContestParticipant.objects.create(contest=contest, user=user, exam_status="in_progress",
                                          started_at=contest.start_time)
    return users


def submit(contest, problem, user):
    return SubmissionService.create_submission(
        user=user, data={"contest": contest, "problem": problem, "code": "int main(){}", "language": "cpp"},
    ).submission


def in_thread(pool, fn):
    """Run fn on its own connection; return (future, backend pid)."""
    pids = Queue()

    def run():
        close_old_connections()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_backend_pid()")
                pids.put(cursor.fetchone()[0])
            return fn()
        finally:
            close_old_connections()

    future = pool.submit(run)
    return future, pids.get(timeout=10)


def wait_until_blocked(pid):
    limit = monotonic() + 10
    while True:
        with connection.cursor() as cursor:
            cursor.execute("SELECT wait_event_type FROM pg_stat_activity WHERE pid = %s", [pid])
            row = cursor.fetchone()
        if row and row[0] == "Lock":
            return
        assert monotonic() < limit, "competing transaction never waited for a PostgreSQL lock"
        sleep(0.02)


def test_open_submission_does_not_block_another_students_submission(contest, problem, students):
    first, second = students
    with ThreadPoolExecutor(max_workers=1) as pool:
        with transaction.atomic():
            submit(contest, problem, first)
            future, _ = in_thread(pool, lambda: submit(contest, problem, second))
            assert future.result(timeout=5).user_id == second.pk
    assert Submission.objects.count() == 2


@pytest.mark.parametrize("writer", ["schedule", "deadline"])
def test_exam_writers_wait_for_open_submission(contest, problem, students, writer):
    def write():
        if writer == "schedule":
            return update_exam_schedule(contest.pk, start_time=contest.start_time,
                                        end_time=timezone.now() - timedelta(seconds=1), actor=contest.owner)
        return finalize_due_exam(contest.pk, now=contest.end_time)

    with ThreadPoolExecutor(max_workers=1) as pool:
        with transaction.atomic():
            submission = submit(contest, problem, students[0])
            future, pid = in_thread(pool, write)
            wait_until_blocked(pid)
        future.result(timeout=10)
    assert Submission.objects.filter(pk=submission.pk).exists()


@pytest.mark.parametrize("writer", ["schedule", "deadline"])
def test_submission_waits_for_exam_writer_and_rechecks(contest, problem, students, writer):
    with ThreadPoolExecutor(max_workers=1) as pool:
        with transaction.atomic():
            if writer == "schedule":
                update_exam_schedule(contest.pk, start_time=contest.start_time,
                                     end_time=timezone.now() - timedelta(seconds=1), actor=contest.owner)
            else:
                assert finalize_due_exam(contest.pk, now=contest.end_time) == len(students)
            future, pid = in_thread(pool, lambda: submit(contest, problem, students[0]))
            wait_until_blocked(pid)
        with pytest.raises(SubmissionAccessError):
            future.result(timeout=10)
    assert not Submission.objects.exists()


def test_submission_waits_for_live_run_update(contest, problem, students):
    run = ExamIntegrityRun.objects.get(contest=contest)
    with ThreadPoolExecutor(max_workers=1) as pool:
        with transaction.atomic():
            ExamIntegrityRun.objects.filter(pk=run.pk).update(session_state="draining")
            future, pid = in_thread(pool, lambda: submit(contest, problem, students[0]))
            wait_until_blocked(pid)
        assert future.result(timeout=10).user_id == students[0].pk
