"""Paper reorder preserves membership and question identity across group moves."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.contests.models import ExamQuestion
from apps.contests.tests.classroom_candidates import create_contest_in_classroom


@pytest.fixture
def paper():
    from apps.users.models import User
    teacher = User.objects.create_user(username="reorder_teacher", password="pass123", role="teacher")
    now = timezone.now()
    contest = create_contest_in_classroom(name="Reorder paper", owner=teacher, status="draft",
        start_time=now + timedelta(hours=1), end_time=now + timedelta(hours=2))
    client = APIClient()
    client.force_authenticate(user=teacher)
    url = f"/api/v1/contests/{contest.id}/exam-paper/"
    def question(prompt):
        return {"question_type": "essay", "prompt": prompt, "score": 5}
    q1 = client.post(url, {"kind": "question", "question": question("Q1")}, format="json").data["id"]
    group = client.post(url, {"kind": "group", "group": {"title": "G"},
        "children": [question("C1"), question("C2")]}, format="json").data
    q2 = client.post(url, {"kind": "question", "question": question("Q2")}, format="json").data["id"]
    return client, url, q1, group["id"], [c["id"] for c in group["children"]], q2


def q(id):
    return {"kind": "question", "id": id}


def g(id, children):
    return {"kind": "group", "id": id, "children": children}


@pytest.mark.django_db
class TestExamPaperReorder:
    def test_move_child_out_to_top_level(self, paper):
        client, url, q1, group, (c1, c2), q2 = paper
        res = client.patch(url, {"blocks": [q(q1), g(group, [c1]), q(c2), q(q2)]}, format="json")
        assert res.status_code == 200, res.data
        assert [b["id"] for b in res.data["blocks"]] == [q1, group, c2, q2]
        assert [c["id"] for c in res.data["blocks"][1]["children"]] == [c1]
        assert ExamQuestion.objects.get(id=c2).group_id is None

    def test_move_top_level_question_into_group_at_index(self, paper):
        client, url, q1, group, (c1, c2), q2 = paper
        res = client.patch(url, {"blocks": [g(group, [c1, q1, c2]), q(q2)]}, format="json")
        assert res.status_code == 200, res.data
        assert [c["id"] for c in res.data["blocks"][0]["children"]] == [c1, q1, c2]
        assert ExamQuestion.objects.get(id=q1).order_in_group == 2

    def test_reorder_children_within_group(self, paper):
        client, url, q1, group, (c1, c2), q2 = paper
        res = client.patch(url, {"blocks": [q(q1), g(group, [c2, c1]), q(q2)]}, format="json")
        assert res.status_code == 200
        assert [c["id"] for c in res.data["blocks"][1]["children"]] == [c2, c1]
        assert [ExamQuestion.objects.get(id=id).order_in_group for id in [c2, c1]] == [1, 2]

    def test_group_without_children_key_keeps_existing_children(self, paper):
        client, url, q1, group, (c1, c2), q2 = paper
        res = client.patch(url, {"blocks": [{"kind": "group", "id": group}, q(q1), q(q2)]}, format="json")
        assert res.status_code == 200
        assert [c["id"] for c in res.data["blocks"][0]["children"]] == [c1, c2]

    def test_implicit_children_exclude_explicit_moves(self, paper):
        client, url, q1, group, (c1, c2), q2 = paper
        res = client.patch(url, {"blocks": [{"kind": "group", "id": group}, q(c1), q(q1), q(q2)]}, format="json")
        assert res.status_code == 200, res.data
        assert [c["id"] for c in res.data["blocks"][0]["children"]] == [c2]

    def test_duplicate_question_returns_400(self, paper):
        client, url, q1, group, (c1, c2), q2 = paper
        res = client.patch(url, {"blocks": [q(c1), g(group, [c1, c2])]}, format="json")
        assert res.status_code == 400
        assert str(res.data["error"]["details"]["blocks"]) == f"duplicate paper question {c1}"

    def test_unknown_question_returns_400_without_changes(self, paper):
        client, url, q1, group, children, q2 = paper
        res = client.patch(url, {"blocks": [g(group, ["999999"])]}, format="json")
        assert res.status_code == 400
        assert str(res.data["error"]["details"]["blocks"]) == "unknown paper block 999999"
        assert ExamQuestion.objects.filter(group_id=group).count() == 2

    def test_empty_group_stays_in_paper(self, paper):
        client, url, q1, group, (c1, c2), q2 = paper
        res = client.patch(url, {"blocks": [q(q1), g(group, []), q(c1), q(c2), q(q2)]}, format="json")
        assert res.status_code == 200, res.data
        assert res.data["blocks"][1]["id"] == group
        assert res.data["blocks"][1]["children"] == []
