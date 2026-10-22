"""Write a finished batch grading run's scores through the QJudge backend.

The AI only fills ``grade_<qid>.csv`` for each question of the run. When the
run ends, this hook validates each CSV, writes scores with the initiator's MCP token (never overwriting an
existing score) and records the outcome in ``progress.csv`` and
``written_<qid>.csv`` of the same session.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any, Protocol
from uuid import UUID

import httpx

from application.batch_grading_contract import parse_batch_units, validate_unit
from application.batch_grading import (
    BATCH_ARTIFACT_STEP,
    BATCH_TASK_TYPE,
    GradeRow,
    append_written_csv,
    parse_batch_question_ids,
    plan_grades,
    progress_status,
    upsert_progress_csv,
)
from domain.ports import McpReadinessError
from infrastructure.oauth.backend_transport import backend_auth_headers

logger = logging.getLogger(__name__)

_CSV_CONTENT_TYPE = "text/csv"


class BatchRuns(Protocol):
    async def load_terminal_run(self, run_id: UUID) -> Any: ...

    async def cancel_queued_in_session(self, session_id: UUID) -> int: ...


class BatchArtifacts(Protocol):
    async def list_for_run(
        self, session_id: UUID, *, step: str | None = None, filename: str | None = None
    ) -> list[Any]: ...

    async def get_content_for_run(self, session_id: UUID, artifact_id: UUID) -> bytes: ...

    async def put_for_run(self, **kwargs: Any) -> Any: ...


class WorkerTokens(Protocol):
    async def worker_token(self, lease_key: str, *, retry_exchange_once: bool) -> str: ...


class BatchGradingFinalizer:
    def __init__(
        self,
        *,
        runs: BatchRuns,
        artifacts: BatchArtifacts,
        credentials: WorkerTokens,
        http: httpx.AsyncClient,
        backend_url: str,
    ) -> None:
        self._runs = runs
        self._artifacts = artifacts
        self._credentials = credentials
        self._http = http
        self._backend_url = backend_url.rstrip("/")

    async def __call__(self, run_id: UUID, lease_key: str) -> None:
        info = await self._runs.load_terminal_run(run_id)
        if info is None:
            return
        manifest = info.session_context.get("task_manifest") or {}
        if manifest.get("task_type") != BATCH_TASK_TYPE:
            return
        paused = False
        plans, invalid = {}, {}
        try:
            units = parse_batch_units(info.user_message)
            if units is not None:
                listed = [qid for unit in units for qid in unit["question_ids"]]
                if sorted(listed) != sorted(set(parse_batch_question_ids(info.user_message))):
                    raise ValueError("批改單位與題目清單不一致")
                for unit in units:
                    try:
                        if info.status != "completed":
                            raise ValueError("題組批改尚未完成，尚未寫分")
                        context = await self._read(info.session_id, unit["context_file"])
                        rubric = await self._read(info.session_id, unit["rubric_file"])
                        if not context or not rubric:
                            raise ValueError("缺少題組上下文或評分規準，尚未寫分")
                        csvs = {qid: await self._read(info.session_id, f"grade_{qid}.csv")
                                for qid in unit["question_ids"]}
                        if not all(csvs.values()):
                            raise ValueError("缺少子題評分結果，尚未寫分")
                        plans.update(validate_unit(unit, context, rubric, csvs))
                        await self._artifacts.put_for_run(
                            session_id=info.session_id, run_id=run_id, step=BATCH_ARTIFACT_STEP,
                            filename=f"accepted_{unit['rubric_file']}", content=rubric.encode(),
                            content_type="application/json", metadata={"validated": True},
                            worker_owned=True,
                        )
                    except Exception as exc:
                        invalid.update({qid: str(exc) for qid in unit["question_ids"]})
        except Exception as exc:
            invalid = {qid: str(exc) for qid in parse_batch_question_ids(info.user_message)}
        for question_id in parse_batch_question_ids(info.user_message):
            try:
                if paused:
                    await self._write_progress(
                        info.session_id, run_id, question_id, status="paused",
                        error="寫入成績的授權已失效，請確認權限後繼續",
                    )
                    continue
                if question_id in invalid and info.status not in ("cancelled",) and info.error_code != "MCP_AUTH_FAILED":
                    await self._write_progress(info.session_id, run_id, question_id,
                        status="failed", error=f"待處理：{invalid[question_id]}")
                    continue
                paused = await self._finalize(info, run_id, question_id, lease_key,
                    validated_plan=plans.get(question_id)) == "paused"
            except Exception as exc:  # the teacher must see it; never leave the question "running"
                logger.exception("Batch grading finalize failed for run %s", run_id)
                await self._write_progress(
                    info.session_id, run_id, question_id, status="failed",
                    error=f"收尾失敗：{exc}",
                )

    async def _finalize(self, info: Any, run_id: UUID, question_id: str, lease_key: str, *, validated_plan=None) -> str:
        session_id = info.session_id
        status = progress_status(info.status, info.error_code)
        written: list[GradeRow] = []
        skipped = rejected = out_of_range = 0
        error = info.error_message or ""

        if status in ("completed", "failed"):
            try:
                written, skipped, rejected, out_of_range = await self._write_grades(
                    session_id, run_id, question_id, lease_key, validated_plan=validated_plan
                )
            except McpReadinessError:
                status, error = "paused", "授權已過期"
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code in (401, 403):
                    status, error = "paused", "寫入成績的授權已失效，請確認權限後繼續"
                else:
                    status, error = "failed", f"寫入成績失敗：{exc}"
            except Exception as exc:  # recorded for the teacher, not raised
                logger.exception("Batch grading write failed for run %s", run_id)
                status, error = "failed", f"寫入成績失敗：{exc}"

        if status == "paused":
            await self._runs.cancel_queued_in_session(session_id)
        if status == "completed":
            error = f"{rejected} 份寫入失敗" if rejected else ""

        if written:
            try:
                existing = await self._read(session_id, f"written_{question_id}.csv")
                await self._write(
                    session_id, run_id, f"written_{question_id}.csv",
                    append_written_csv(existing, written),
                )
            except Exception:
                # Django committed a durable receipt with each grade. The UI
                # reads those receipts even when this presentation copy fails.
                logger.exception("Batch write artifact unavailable for run %s", run_id)
        await self._write_progress(
            session_id, run_id, question_id, status=status, error=error,
            written=len(written), skipped=skipped, out_of_range=out_of_range,
        )
        return status

    async def _write_progress(
        self,
        session_id: UUID,
        run_id: UUID,
        question_id: str,
        *,
        status: str,
        error: str,
        written: int = 0,
        skipped: int = 0,
        out_of_range: int = 0,
    ) -> None:
        progress = await self._read(session_id, "progress.csv")
        await self._write(
            session_id,
            run_id,
            "progress.csv",
            upsert_progress_csv(
                progress,
                {
                    "question_id": question_id,
                    "run_id": str(run_id),
                    "status": status,
                    "written_count": str(written),
                    "skipped_count": str(skipped),
                    "out_of_range_count": str(out_of_range),
                    "error": error,
                    "updated_at": datetime.now(UTC).isoformat(),
                },
            ),
        )

    async def _write_grades(
        self, session_id: UUID, run_id: UUID, question_id: str, lease_key: str, *, validated_plan=None
    ) -> tuple[list[GradeRow], int, int, int]:
        batch = json.loads(await self._read(session_id, "batch.json") or "{}")
        question = next(
            (q for q in batch.get("questions", []) if str(q.get("question_id")) == question_id),
            None,
        )
        grade_csv = await self._read(session_id, f"grade_{question_id}.csv")
        if question is None or grade_csv is None:
            raise ValueError("找不到題目設定或批改檔")
        plan = validated_plan or plan_grades(grade_csv, float(question["max_score"]))
        if not plan.rows:
            return [], 0, 0, plan.out_of_range_count

        token = await self._credentials.worker_token(lease_key, retry_exchange_once=True)
        response = await self._http.post(
            f"{self._backend_url}/api/v1/contests/{batch['contest_id']}"
            "/exam-answers/batch-grade/",
            json={
                "grades": [
                    {"exam_answer_id": r.exam_answer_id, "score": r.score, "feedback": r.feedback}
                    for r in plan.rows
                ],
                "only_if_ungraded": True,
                "batch_session_id": str(session_id),
                "batch_run_id": str(run_id),
                # The AI can rewrite the CSV; never let it grade another question.
                "question_id": question_id,
            },
            headers={**backend_auth_headers(), "Authorization": f"Bearer {token}"},
        )
        response.raise_for_status()
        by_id = {r.exam_answer_id: r for r in plan.rows}
        results = response.json().get("results", [])
        written = [
            by_id[str(r["exam_answer_id"])]
            for r in results
            if r.get("status") == "ok" and str(r.get("exam_answer_id")) in by_id
        ]
        skipped = sum(1 for r in results if r.get("status") == "skipped")
        rejected = sum(1 for r in results if r.get("status") == "error")
        return written, skipped, rejected, plan.out_of_range_count

    async def _read(self, session_id: UUID, filename: str) -> str | None:
        artifacts = await self._artifacts.list_for_run(
            session_id, step=BATCH_ARTIFACT_STEP, filename=filename
        )
        if not artifacts:
            return None
        content = await self._artifacts.get_content_for_run(session_id, artifacts[0].id)
        return content.decode("utf-8")

    async def _write(self, session_id: UUID, run_id: UUID, filename: str, text: str) -> None:
        await self._artifacts.put_for_run(
            session_id=session_id,
            run_id=run_id,
            step=BATCH_ARTIFACT_STEP,
            filename=filename,
            content=text.encode("utf-8"),
            content_type=_CSV_CONTENT_TYPE,
            metadata={},
        )
