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
    def test_reorder_children_within_group(self, paper):
        client, url, q1, group, (c1, c2), q2 = paper
        res = client.patch(url, {"blocks": [q(q1), g(group, [c2, c1]), q(q2)]}, format="json")
        assert res.status_code == 200, res.data
        assert [c["id"] for c in res.data["blocks"][1]["children"]] == [c2, c1]
        assert [ExamQuestion.objects.get(id=id).order_in_group for id in [c2, c1]] == [1, 2]

    def test_group_without_children_key_keeps_existing_children(self, paper):
        client, url, q1, group, (c1, c2), q2 = paper
        res = client.patch(url, {"blocks": [{"kind": "group", "id": group}, q(q1), q(q2)]}, format="json")
        assert res.status_code == 200
        assert [c["id"] for c in res.data["blocks"][0]["children"]] == [c1, c2]

    @pytest.mark.parametrize("change", ["add_member", "remove_member", "child_as_top_level"])
    def test_reorder_preserves_group_membership(self, paper, change):
        client, url, q1, group, (c1, c2), q2 = paper
        blocks = {
            "add_member": [g(group, [c1, q1, c2]), q(q2)],
            "remove_member": [q(q1), g(group, [c1]), q(q2)],
            "child_as_top_level": [q(q1), g(group, [c1]), q(c2), q(q2)],
        }[change]
        res = client.patch(url, {"blocks": blocks}, format="json")
        assert res.status_code == 400
        assert ExamQuestion.objects.get(id=q1).group_id is None
        assert [str(value) for value in ExamQuestion.objects.filter(group_id=group).order_by('order_in_group').values_list('id', flat=True)] == [c1, c2]

    def test_duplicate_child_returns_400(self, paper):
        client, url, q1, group, (c1, c2), q2 = paper
        res = client.patch(url, {"blocks": [q(q1), g(group, [c1, c1]), q(q2)]}, format="json")
        assert res.status_code == 400
        assert ExamQuestion.objects.filter(group_id=group).count() == 2

    def test_unknown_block_returns_400(self, paper):
        client, url, q1, group, children, q2 = paper
        res = client.patch(url, {"blocks": [g("999999", [])]}, format="json")
        assert res.status_code == 400
        assert str(res.data["error"]["details"]["blocks"]) == "unknown paper block 999999"

    def test_empty_group_stays_in_paper(self, paper):
        client, url, q1, group, (c1, c2), q2 = paper
        created = client.post(url, {"kind": "group", "group": {"title": "Empty group"}}, format="json")
        empty_group = created.data["id"]
        res = client.patch(url, {"blocks": [g(empty_group, []), q(q1), g(group, [c1, c2]), q(q2)]}, format="json")
        assert res.status_code == 200, res.data
        assert res.data["blocks"][0]["id"] == empty_group
        assert res.data["blocks"][0]["children"] == []
