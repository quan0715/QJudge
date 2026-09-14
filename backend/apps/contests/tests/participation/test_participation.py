"""Eligibility is classroom membership; the attempt record is created on use.

There is no registration step and no roster sync. These tests pin who counts
as a candidate, that the bulk and per-user answers agree, what a teacher's
roster contains, and how the contest detail presents a candidate who has not
acted yet.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.classrooms.models import Classroom, ClassroomContest, ClassroomMember
from apps.classrooms.permissions import get_user_role_in_classroom
from apps.classrooms.services import generate_invite_code
from apps.contests.models import Contest, ContestParticipant, ExamStatus
from apps.contests.services.participation import (
    candidate_user_ids,
    is_contest_candidate,
    roster_user_ids,
)

User = get_user_model()


class ParticipationFixture(APITestCase):
    def setUp(self):
        now = timezone.now()
        self.owner = self._user("owner", role="teacher")
        self.co_admin = self._user("co_admin", role="teacher")
        self.ta = self._user("ta")
        self.student = self._user("student")
        self.other_student = self._user("other_student")
        self.platform_admin = self._user("platform_admin", is_staff=True)
        self.outsider = self._user("outsider")

        self.classroom = Classroom.objects.create(
            name="Algorithms", owner=self.owner, invite_code=generate_invite_code(),
        )
        self.classroom.admins.add(self.co_admin)
        for user, role in (
            (self.ta, "ta"),
            (self.student, "student"),
            (self.other_student, "student"),
            (self.platform_admin, "student"),
        ):
            ClassroomMember.objects.create(classroom=self.classroom, user=user, role=role)

        self.contest = Contest.objects.create(
            name="Midterm",
            owner=self.owner,
            status="published",
            start_time=now - timedelta(minutes=5),
            end_time=now + timedelta(hours=2),
        )
        ClassroomContest.objects.create(classroom=self.classroom, contest=self.contest)

    @staticmethod
    def _user(username, *, role="student", is_staff=False):
        return User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="password",
            role=role,
            is_staff=is_staff,
        )


class CandidateRuleTests(ParticipationFixture):
    def test_only_student_members_are_candidates(self):
        self.assertTrue(is_contest_candidate(self.student, self.contest))
        for staff in (self.owner, self.co_admin, self.ta, self.platform_admin):
            self.assertFalse(is_contest_candidate(staff, self.contest), staff.username)
        self.assertFalse(is_contest_candidate(self.outsider, self.contest))

    def test_an_unbound_contest_has_no_candidates(self):
        unbound = Contest.objects.create(name="Loose", owner=self.owner, status="published")

        self.assertFalse(is_contest_candidate(self.student, unbound))
        self.assertEqual(candidate_user_ids(unbound), [])

    def test_bulk_candidate_list_agrees_with_the_per_user_rule(self):
        # candidate_user_ids is a bulk query; is_contest_candidate goes through
        # get_user_role_in_classroom. They must never drift apart.
        members = [m.user for m in self.classroom.memberships.select_related("user")]
        expected = {
            u.id for u in members
            if get_user_role_in_classroom(u, self.classroom) == "member"
        }

        self.assertEqual(set(candidate_user_ids(self.contest)), expected)
        self.assertEqual(expected, {self.student.id, self.other_student.id})

    def test_joining_the_classroom_is_enough_no_row_is_copied(self):
        newcomer = self._user("newcomer")
        ClassroomMember.objects.create(classroom=self.classroom, user=newcomer, role="student")

        self.assertTrue(is_contest_candidate(newcomer, self.contest))
        self.assertFalse(
            ContestParticipant.objects.filter(contest=self.contest, user=newcomer).exists()
        )


class RosterTests(ParticipationFixture):
    def test_roster_lists_students_who_have_not_acted_yet(self):
        self.assertEqual(
            roster_user_ids(self.contest),
            sorted([self.student.id, self.other_student.id]),
        )

    def test_a_removed_student_who_sat_the_exam_stays_on_the_roster(self):
        ContestParticipant.objects.create(
            contest=self.contest, user=self.student,
            exam_status=ExamStatus.SUBMITTED, started_at=timezone.now(),
        )
        ClassroomMember.objects.filter(user=self.student).delete()

        self.assertIn(self.student.id, roster_user_ids(self.contest))

    def test_a_removed_student_who_never_sat_it_drops_off(self):
        ContestParticipant.objects.create(contest=self.contest, user=self.student)
        ClassroomMember.objects.filter(user=self.student).delete()

        self.assertNotIn(self.student.id, roster_user_ids(self.contest))

    def test_a_teacher_trying_their_own_paper_never_reads_as_a_student(self):
        ContestParticipant.objects.create(
            contest=self.contest, user=self.owner,
            exam_status=ExamStatus.SUBMITTED, started_at=timezone.now(),
        )

        self.assertNotIn(self.owner.id, roster_user_ids(self.contest))

    def test_teacher_participant_list_includes_students_without_a_row(self):
        ContestParticipant.objects.create(
            contest=self.contest, user=self.student,
            exam_status=ExamStatus.IN_PROGRESS, started_at=timezone.now(),
        )
        self.client.force_authenticate(user=self.owner)

        response = self.client.get(f"/api/v1/contests/{self.contest.id}/participants/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        by_user = {row["user_id"]: row for row in response.data}
        self.assertEqual(set(by_user), {self.student.id, self.other_student.id})
        self.assertEqual(by_user[self.student.id]["exam_status"], ExamStatus.IN_PROGRESS)
        self.assertEqual(by_user[self.other_student.id]["exam_status"], ExamStatus.NOT_STARTED)
        # Listing the roster must not materialise attempt records.
        self.assertFalse(
            ContestParticipant.objects.filter(
                contest=self.contest, user=self.other_student,
            ).exists()
        )


class ContestDetailPresentationTests(ParticipationFixture):
    def _detail(self, user):
        self.client.force_authenticate(user=user)
        response = self.client.get(f"/api/v1/contests/{self.contest.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data

    def test_a_candidate_without_a_row_reads_as_not_started(self):
        data = self._detail(self.student)

        self.assertTrue(data["can_participate"])
        self.assertFalse(data["has_joined"])
        self.assertEqual(data["exam_status"], ExamStatus.NOT_STARTED)

    def test_an_outsider_cannot_participate_and_has_no_status(self):
        # Outsiders may still be refused the detail itself by the access
        # policy; when they can read it, it must not offer participation.
        self.client.force_authenticate(user=self.outsider)
        response = self.client.get(f"/api/v1/contests/{self.contest.id}/")
        if response.status_code == status.HTTP_200_OK:
            self.assertFalse(response.data["can_participate"])
            self.assertIsNone(response.data["exam_status"])

    def test_staff_are_never_offered_participation(self):
        data = self._detail(self.owner)

        self.assertFalse(data["can_participate"])

    def test_candidates_see_the_problem_list_before_their_first_action(self):
        from uuid import uuid4

        from apps.problems.models import CodingProblem
        from apps.question_bank.models import ContestQuestionBinding, QuestionAsset

        asset = QuestionAsset.objects.create(
            owner=self.owner, asset_type=QuestionAsset.AssetType.CODING, title="A+B",
        )
        problem = CodingProblem.objects.create(
            slug=f"a-plus-b-{uuid4().hex[:8]}", created_by=self.owner, question_asset=asset,
        )
        ContestQuestionBinding.objects.create(
            contest=self.contest, question_asset=asset, coding_problem=problem,
            binding_type=QuestionAsset.AssetType.CODING, order=0, score=100,
        )

        # Synced students used to see the list once the window opened; a
        # candidate with no attempt record yet must see exactly the same.
        self.assertEqual(len(self._detail(self.student)["problems"]), 1)
        self.assertFalse(
            ContestParticipant.objects.filter(contest=self.contest, user=self.student).exists()
        )

    def test_participant_count_is_the_roster_size(self):
        data = self._detail(self.owner)

        self.assertEqual(data["participant_count"], 2)
