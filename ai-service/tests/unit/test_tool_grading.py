import json
from uuid import uuid4

import httpx
import pytest

from infrastructure.tool_grading import ToolGrading


def harness(status=200, response=None):
    requests = []
    state = {"active": True}

    async def token():
        return "test-token"

    async def active():
        return state["active"]

    def handler(request):
        requests.append((request.url.path, json.loads(request.content)))
        assert request.headers["Authorization"] == "Bearer test-token"
        return httpx.Response(status, json=response if response is not None else {"draft_count": 1})

    service = ToolGrading(
        session_id=uuid4(), run_id=uuid4(), contest_id="c",
        units=[{"id": "question_q", "label": "第1題", "question_ids": ["q"], "teacher_note": "partial credit"}],
        http=httpx.AsyncClient(transport=httpx.MockTransport(handler)), backend_url="http://backend",
        token=token, is_active=active,
    )
    return service, requests, state


@pytest.mark.asyncio
async def test_assignment_lists_the_requested_units_without_instructions():
    service, requests, _ = harness()
    assert await service.assignment() == {"units": [
        {"id": "question_q", "label": "第1題", "question_ids": ["q"], "teacher_note": "partial credit"},
    ]}
    assert requests == []
    assert [tool.name for tool in service.tools()] == [
        "get_grading_assignment", "get_grading_unit", "save_grading_draft", "submit_grading_unit", "verify_grading_unit",
    ]


@pytest.mark.asyncio
async def test_requests_carry_the_run_scope():
    service, requests, _ = harness()
    await service.read("question_q")
    assert requests[0] == ("/api/v1/contests/c/exam-answers/grading-unit/", {
        "session_id": str(service.session_id), "run_id": str(service.run_id),
        "unit_id": "question_q", "question_ids": ["q"], "teacher_note": "partial credit",
    })
    grades = [{"exam_answer_id": "17", "score": 0, "feedback": "incorrect"}]
    await service.save("question_q", grades)
    assert requests[1][0].endswith("grading-draft/") and requests[1][1]["grades"] == grades
    await service.submit("question_q")
    assert requests[2][0].endswith("grading-submit/")


@pytest.mark.asyncio
async def test_foreign_unit_and_stopped_run_never_reach_backend():
    service, requests, state = harness()
    assert (await service.read("other"))["is_error"]
    state["active"] = False
    assert (await service.submit("question_q"))["is_error"]
    assert requests == []


@pytest.mark.asyncio
async def test_backend_answers_are_returned_as_is():
    service, _, _ = harness(400, {"detail": "Missing 2 answers"})
    result = await service.submit("question_q")
    assert result["is_error"] and result["detail"] == {"detail": "Missing 2 answers"}
    outcome = {"unit_id": "question_q", "written": 1, "skipped": 1, "failed": 0}
    service, _, _ = harness(response=outcome)
    assert await service.submit("question_q") == outcome


@pytest.mark.asyncio
async def test_verify_and_targeted_retry_preserve_scope():
    service, requests, state = harness()
    await service.verify("question_q")
    assert requests[-1][0].endswith("grading-verify/")
    assert requests[-1][1]["run_id"] == str(service.run_id)
    await service.submit("question_q", ["17"])
    assert requests[-1][1]["answer_ids"] == ["17"]
    count = len(requests)
    assert (await service.verify("other"))["is_error"]
    state["active"] = False
    assert (await service.verify("question_q"))["is_error"]
    assert len(requests) == count


@pytest.mark.asyncio
async def test_server_export_reads_once_and_writes_two_artifacts():
    from unittest.mock import AsyncMock
    service, _, _ = harness()
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"units": [{"unit_id": "q", "questions": [{"question_id": "q", "label": "1", "order": 0}],
            "rubric": {"criterion": "correct"}, "answers": [], "grades": []}], "official_grades": {}})
    service.http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    artifacts = AsyncMock()
    await service.export_artifacts(artifacts)
    assert len(requests) == 1 and requests[0].method == "GET"
    assert requests[0].url.params["run_id"] == str(service.run_id)
    assert [c.kwargs["filename"] for c in artifacts.put_for_run.call_args_list] == ["rubric.md", "grade.csv"]
    assert all(c.kwargs["run_id"] == service.run_id for c in artifacts.put_for_run.call_args_list)
