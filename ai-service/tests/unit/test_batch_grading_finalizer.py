"""Batch grading finalizer: turn a finished run's grade CSV into grade writes."""

from __future__ import annotations

import csv
import io
import json
from uuid import UUID, uuid4

import httpx
import pytest

from domain.models import Artifact
from domain.ports import McpAuthFailed
from infrastructure.batch_grading_finalizer import BatchGradingFinalizer
from worker.runtime import TerminalRunInfo

SESSION_ID = UUID("11111111-1111-4111-8111-111111111111")
RUN_ID = UUID("22222222-2222-4222-8222-222222222222")
BATCH_CONTEXT = {"task_manifest": {"task_type": "grading.batch", "context": {"contest_id": "c1"}}}
GRADE_CSV = (
    "index,exam_answer_id,username,answer_text,original_score,original_feedback,score,reason,synced\n"
    "1,a1,u1,答案,,,8,不錯,\n"
    "2,a2,u2,答案,,,,,\n"
    "3,a3,u3,答案,,,12,太高,\n"
)


class FakeRuns:
    def __init__(self, info: TerminalRunInfo | None) -> None:
        self.info = info
        self.cancelled_sessions: list[UUID] = []

    async def load_terminal_run(self, run_id: UUID) -> TerminalRunInfo | None:
        return self.info

    async def cancel_queued_in_session(self, session_id: UUID) -> int:
        self.cancelled_sessions.append(session_id)
        return 2


class FakeArtifacts:
    def __init__(self, files: dict[str, str]) -> None:
        self.files = dict(files)
        self.reads: list[str] = []
        self._ids: dict[UUID, str] = {}

    async def list_for_run(self, session_id, *, step=None, filename=None):
        assert step == "batch"
        if filename not in self.files:
            return []
        artifact_id = uuid4()
        self._ids[artifact_id] = filename
        return [Artifact(artifact_id, session_id, None, step, filename, "text/plain")]

    async def get_content_for_run(self, session_id, artifact_id):
        filename = self._ids[artifact_id]
        self.reads.append(filename)
        return self.files[filename].encode()

    async def put_for_run(self, *, session_id, run_id, step, filename, content, content_type, metadata, worker_owned=False):
        assert step == "batch"
        self.files[filename] = content.decode()


class Credentials:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail

    async def worker_token(self, lease_key, *, retry_exchange_once):
        if self.fail:
            raise McpAuthFailed("expired")
        return "mcp-token"


def _info(
    status: str = "completed",
    error_code: str | None = None,
    context=BATCH_CONTEXT,
    question_ids: str = "q3",
):
    return TerminalRunInfo(
        session_id=SESSION_ID,
        status=status,
        error_code=error_code,
        error_message="boom" if status == "failed" else None,
        user_message=f"batch_question_id: {question_ids}\n請批改",
        session_context=context,
    )


def _batch_files() -> dict[str, str]:
    return {
        "batch.json": json.dumps(
            {"contest_id": "c1", "questions": [{"question_id": "q3", "label": "Q3", "index": 3, "max_score": 10}]}
        ),
        "grade_q3.csv": GRADE_CSV,
    }


def _finalizer(runs, artifacts, *, credentials=None, responses=None):
    posted: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        posted.append({"url": str(request.url), "auth": request.headers["authorization"], "body": body})
        results = responses or [{"exam_answer_id": g["exam_answer_id"], "status": "ok"} for g in body["grades"]]
        return httpx.Response(200, json={"results": results})

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    finalizer = BatchGradingFinalizer(
        runs=runs,
        artifacts=artifacts,
        credentials=credentials or Credentials(),
        http=http,
        backend_url="http://backend:8000",
    )
    return finalizer, posted


def _csv(text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(text)))


def _synced(text: str) -> dict[str, str]:
    return {row["exam_answer_id"]: row["synced"] for row in _csv(text)}


@pytest.mark.asyncio
async def test_completed_run_posts_grades_and_marks_each_grade_row() -> None:
    artifacts = FakeArtifacts(_batch_files())
    finalizer, posted = _finalizer(FakeRuns(_info()), artifacts)

    await finalizer(RUN_ID, "lease:teacher")

    assert posted == [
        {
            "url": "http://backend:8000/api/v1/contests/c1/exam-answers/batch-grade/",
            "auth": "Bearer mcp-token",
            "body": {
                "grades": [{"exam_answer_id": "a1", "score": 8.0, "feedback": "不錯"}],
                "only_if_ungraded": True,
                "batch_session_id": str(SESSION_ID),
                "batch_run_id": str(RUN_ID),
                "question_id": "q3",
            },
        }
    ]
    assert "written_q3.csv" not in artifacts.files
    assert _synced(artifacts.files["grade_q3.csv"]) == {"a1": "yes", "a2": "", "a3": "out_of_range"}
    assert _csv(artifacts.files["grade_q3.csv"])[0]["reason"] == "不錯"
    progress = _csv(artifacts.files["progress.csv"])
    assert list(progress[0]) == ["question_id", "run_id", "status", "error", "updated_at"]
    assert progress[0]["question_id"] == "q3"
    assert progress[0]["run_id"] == str(RUN_ID)
    assert progress[0]["status"] == "completed"


@pytest.mark.asyncio
async def test_grade_write_survives_backend_https_redirect() -> None:
    # Production Django redirects plain-HTTP requests unless the proxy header says HTTPS.
    def handler(request: httpx.Request) -> httpx.Response:
        if request.headers.get("x-forwarded-proto") != "https":
            return httpx.Response(301, headers={"location": "https://backend:8000/"})
        body = json.loads(request.content)
        return httpx.Response(
            200, json={"results": [{"exam_answer_id": g["exam_answer_id"], "status": "ok"} for g in body["grades"]]}
        )

    artifacts = FakeArtifacts(_batch_files())
    finalizer = BatchGradingFinalizer(
        runs=FakeRuns(_info()),
        artifacts=artifacts,
        credentials=Credentials(),
        http=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        backend_url="http://backend:8000",
    )

    await finalizer(RUN_ID, "lease:teacher")

    progress = _csv(artifacts.files["progress.csv"])
    assert progress[0]["status"] == "completed"
    assert _synced(artifacts.files["grade_q3.csv"])["a1"] == "yes"


@pytest.mark.asyncio
async def test_skipped_rows_are_marked_skipped() -> None:
    artifacts = FakeArtifacts(_batch_files())
    finalizer, _ = _finalizer(
        FakeRuns(_info()), artifacts, responses=[{"exam_answer_id": "a1", "status": "skipped"}]
    )

    await finalizer(RUN_ID, "lease:teacher")

    assert _synced(artifacts.files["grade_q3.csv"])["a1"] == "skipped"
    assert _csv(artifacts.files["progress.csv"])[0]["status"] == "completed"


@pytest.mark.asyncio
async def test_failed_run_still_writes_filled_rows() -> None:
    artifacts = FakeArtifacts(_batch_files())
    finalizer, posted = _finalizer(FakeRuns(_info("failed", "WORKER_STALE")), artifacts)

    await finalizer(RUN_ID, "lease:teacher")

    assert len(posted) == 1
    progress = _csv(artifacts.files["progress.csv"])[0]
    assert progress["status"] == "failed"
    assert progress["error"] == "boom"


@pytest.mark.asyncio
async def test_auth_failure_cancels_queued_runs() -> None:
    runs = FakeRuns(_info("failed", "MCP_AUTH_FAILED"))
    artifacts = FakeArtifacts(_batch_files())
    finalizer, posted = _finalizer(runs, artifacts)

    await finalizer(RUN_ID, "lease:teacher")

    assert posted == []
    assert runs.cancelled_sessions == [SESSION_ID]
    assert _csv(artifacts.files["progress.csv"])[0]["status"] == "paused"


@pytest.mark.asyncio
async def test_expired_token_pauses_batch() -> None:
    runs = FakeRuns(_info())
    artifacts = FakeArtifacts(_batch_files())
    finalizer, posted = _finalizer(runs, artifacts, credentials=Credentials(fail=True))

    await finalizer(RUN_ID, "lease:teacher")

    assert posted == []
    assert runs.cancelled_sessions == [SESSION_ID]
    assert _csv(artifacts.files["progress.csv"])[0]["status"] == "paused"


@pytest.mark.asyncio
async def test_backend_error_records_failed_progress() -> None:
    artifacts = FakeArtifacts(_batch_files())
    http = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(500)))
    finalizer = BatchGradingFinalizer(
        runs=FakeRuns(_info()),
        artifacts=artifacts,
        credentials=Credentials(),
        http=http,
        backend_url="http://backend:8000",
    )

    await finalizer(RUN_ID, "lease:teacher")

    progress = _csv(artifacts.files["progress.csv"])[0]
    assert progress["status"] == "failed"
    assert "500" in progress["error"]


@pytest.mark.asyncio
async def test_backend_error_rows_are_reported() -> None:
    artifacts = FakeArtifacts(_batch_files())
    finalizer, _ = _finalizer(
        FakeRuns(_info()), artifacts, responses=[{"exam_answer_id": "a1", "status": "error"}]
    )

    await finalizer(RUN_ID, "lease:teacher")

    progress = _csv(artifacts.files["progress.csv"])[0]
    assert progress["status"] == "completed"
    assert "1" in progress["error"]
    assert _synced(artifacts.files["grade_q3.csv"])["a1"] == "error"


class FailingGradeArtifacts(FakeArtifacts):
    async def put_for_run(self, *, filename, **kwargs):
        if filename.startswith("grade_"):
            raise RuntimeError("s3 down")
        await super().put_for_run(filename=filename, **kwargs)


@pytest.mark.asyncio
async def test_marking_failure_keeps_success_with_durable_backend_receipt() -> None:
    artifacts = FailingGradeArtifacts(_batch_files())
    finalizer, posted = _finalizer(FakeRuns(_info()), artifacts)

    await finalizer(RUN_ID, "lease:teacher")

    assert len(posted) == 1
    progress = _csv(artifacts.files["progress.csv"])[0]
    assert progress["status"] == "completed"
    assert posted[0]["body"]["batch_session_id"] == str(SESSION_ID)
    assert posted[0]["body"]["batch_run_id"] == str(RUN_ID)


@pytest.mark.asyncio
async def test_cancelled_run_only_records_progress() -> None:
    artifacts = FakeArtifacts(_batch_files())
    finalizer, posted = _finalizer(FakeRuns(_info("cancelled")), artifacts)

    await finalizer(RUN_ID, "lease:teacher")

    assert posted == []
    assert _csv(artifacts.files["progress.csv"])[0]["status"] == "cancelled"


@pytest.mark.asyncio
async def test_non_batch_session_is_ignored() -> None:
    artifacts = FakeArtifacts(_batch_files())
    context = {"task_manifest": {"task_type": "grading.question", "context": {}}}
    finalizer, posted = _finalizer(FakeRuns(_info(context=context)), artifacts)

    await finalizer(RUN_ID, "lease:teacher")

    assert posted == []
    assert artifacts.reads == []
    assert "progress.csv" not in artifacts.files


@pytest.mark.asyncio
@pytest.mark.parametrize("http_status", [401, 403])
async def test_backend_auth_rejection_pauses_remaining_queue(http_status):
    runs = FakeRuns(_info())
    artifacts = FakeArtifacts(_batch_files())
    async with httpx.AsyncClient(transport=httpx.MockTransport(
        lambda request: httpx.Response(http_status, json={"detail": "permission denied"})
    )) as http:
        finalizer = BatchGradingFinalizer(runs=runs, artifacts=artifacts,
            credentials=Credentials(), http=http, backend_url="http://backend:8000")
        await finalizer(RUN_ID, "lease:teacher")
    assert runs.cancelled_sessions == [SESSION_ID]
    assert _csv(artifacts.files["progress.csv"])[0]["status"] == "paused"
    assert set(_synced(artifacts.files["grade_q3.csv"]).values()) == {""}


@pytest.mark.asyncio
async def test_run_with_several_questions_finalizes_each_one() -> None:
    files = _batch_files()
    batch = json.loads(files["batch.json"])
    batch["questions"] += [
        {"question_id": "q4", "label": "Q4", "index": 4, "max_score": 10},
        {"question_id": "q5", "label": "Q5", "index": 5, "max_score": 10},
    ]
    files["batch.json"] = json.dumps(batch)
    files["grade_q4.csv"] = GRADE_CSV.replace("a1,", "b1,").replace("a2,", "b2,").replace("a3,", "b3,")
    # q5 has no grade CSV: it fails alone without blocking the others.
    artifacts = FakeArtifacts(files)
    finalizer, posted = _finalizer(FakeRuns(_info(question_ids="q3,q4,q5")), artifacts)

    await finalizer(RUN_ID, "lease:teacher")

    assert [p["body"]["question_id"] for p in posted] == ["q3", "q4"]
    assert _synced(artifacts.files["grade_q4.csv"])["b1"] == "yes"
    progress = {row["question_id"]: row for row in _csv(artifacts.files["progress.csv"])}
    assert {qid: row["status"] for qid, row in progress.items()} == {
        "q3": "completed",
        "q4": "completed",
        "q5": "failed",
    }
    assert {row["run_id"] for row in progress.values()} == {str(RUN_ID)}


@pytest.mark.asyncio
@pytest.mark.parametrize("http_status", [401, 403])
async def test_auth_rejection_also_pauses_other_questions_in_the_same_run(http_status):
    files = _batch_files()
    batch = json.loads(files["batch.json"])
    batch["questions"].append({"question_id": "q4", "max_score": 10})
    files["batch.json"] = json.dumps(batch)
    files["grade_q4.csv"] = GRADE_CSV
    artifacts = FakeArtifacts(files)
    runs = FakeRuns(_info(question_ids="q3,q4"))
    requests = []

    def reject(request):
        requests.append(request)
        return httpx.Response(http_status)

    async with httpx.AsyncClient(transport=httpx.MockTransport(reject)) as http:
        finalizer = BatchGradingFinalizer(runs=runs, artifacts=artifacts,
            credentials=Credentials(), http=http, backend_url="http://backend:8000")
        await finalizer(RUN_ID, "lease:teacher")

    assert len(requests) == 1
    assert runs.cancelled_sessions == [SESSION_ID]
    progress = {row["question_id"]: row["status"] for row in _csv(artifacts.files["progress.csv"])}
    assert progress == {"q3": "paused", "q4": "paused"}


@pytest.mark.asyncio
async def test_v2_missing_rubric_blocks_entire_group_then_validates_child_scores():
    from dataclasses import replace
    from test_batch_grading_contract import fixture
    m,c,r,files = fixture()
    m.update(context_file='context.json',rubric_file='rubric.json')
    batch={'contest_id':'c1','questions':[{'question_id':'a','max_score':3},{'question_id':'b','max_score':5}]}
    stored={'batch.json':json.dumps(batch),'context.json':json.dumps(c),**{f'grade_{qid}.csv':content for qid,content in files.items()}}
    info=replace(_info(question_ids='a,b'),user_message='batch_question_id: a,b\nbatch_units: '+json.dumps([m]))
    artifacts=FakeArtifacts(stored); finalizer,posted=_finalizer(FakeRuns(info),artifacts)
    await finalizer(RUN_ID,'lease')
    assert posted==[]
    assert {x['status'] for x in _csv(artifacts.files['progress.csv'])}=={'failed'}
    artifacts.files['rubric.json']=json.dumps(r)
    await finalizer(RUN_ID,'lease')
    assert [p['body']['grades'][0]['score'] for p in posted]==[2,4]
