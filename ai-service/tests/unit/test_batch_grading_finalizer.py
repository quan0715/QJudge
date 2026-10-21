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

    async def put_for_run(self, *, session_id, run_id, step, filename, content, content_type, metadata):
        assert step == "batch"
        self.files[filename] = content.decode()


class Credentials:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail

    async def worker_token(self, lease_key, *, retry_exchange_once):
        if self.fail:
            raise McpAuthFailed("expired")
        return "mcp-token"


def _info(status: str = "completed", error_code: str | None = None, context=BATCH_CONTEXT):
    return TerminalRunInfo(
        session_id=SESSION_ID,
        status=status,
        error_code=error_code,
        error_message="boom" if status == "failed" else None,
        user_message="batch_question_id: q3\n請批改",
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


@pytest.mark.asyncio
async def test_completed_run_posts_grades_and_records_written() -> None:
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
                "question_id": "q3",
            },
        }
    ]
    assert _csv(artifacts.files["written_q3.csv"]) == [
        {"exam_answer_id": "a1", "score": "8.0", "feedback": "不錯"}
    ]
    progress = _csv(artifacts.files["progress.csv"])
    assert progress[0]["question_id"] == "q3"
    assert progress[0]["run_id"] == str(RUN_ID)
    assert progress[0]["status"] == "completed"
    assert progress[0]["written_count"] == "1"
    assert progress[0]["out_of_range_count"] == "1"


@pytest.mark.asyncio
async def test_skipped_rows_not_recorded() -> None:
    artifacts = FakeArtifacts(_batch_files())
    finalizer, _ = _finalizer(
        FakeRuns(_info()), artifacts, responses=[{"exam_answer_id": "a1", "status": "skipped"}]
    )

    await finalizer(RUN_ID, "lease:teacher")

    assert "written_q3.csv" not in artifacts.files
    progress = _csv(artifacts.files["progress.csv"])[0]
    assert progress["written_count"] == "0"
    assert progress["skipped_count"] == "1"


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
    assert progress["written_count"] == "0"
    assert "1" in progress["error"]


class FailingWrittenArtifacts(FakeArtifacts):
    async def put_for_run(self, *, filename, **kwargs):
        if filename.startswith("written_"):
            raise RuntimeError("s3 down")
        await super().put_for_run(filename=filename, **kwargs)


@pytest.mark.asyncio
async def test_artifact_failure_still_records_failed_progress() -> None:
    artifacts = FailingWrittenArtifacts(_batch_files())
    finalizer, posted = _finalizer(FakeRuns(_info()), artifacts)

    await finalizer(RUN_ID, "lease:teacher")

    assert len(posted) == 1
    progress = _csv(artifacts.files["progress.csv"])[0]
    assert progress["status"] == "failed"
    assert "s3 down" in progress["error"]


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
