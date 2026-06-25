from __future__ import annotations

import csv
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from . import __version__
from .grading import run_question_grading
from .manifest import write_manifest

DEFAULT_EXPERIMENT_MODELS = [
    "deepseek-v4-flash",
    "deepseek-v4-pro",
]

EXPERIMENT_PRESETS: dict[str, dict[str, Any]] = {
    "exam1-subjective": {
        "exam_key": "exam1",
        "contest_id": "08545ef3-9b1b-40ac-9afc-a751c36d2c4a",
        "description": "Exam1 all subjective/short-answer questions.",
        "question_ids": [
            "7b0b8919-6a25-48de-a6be-753fadfcb0c5",
            "66ec6c12-2ebb-42e2-8aea-814f9b9a4c49",
            "199417a2-c63c-436e-8a8d-869d348dbbdd",
            "bc513144-2e7e-4363-8375-56c87bc07ff0",
            "f2dac513-8733-4f95-8e93-ce1e5e922334",
            "47cb43c4-ca23-4831-960c-018702c06992",
            "fe59c063-d7d5-4d1a-8d82-90dd1e67c55b",
            "1a14a6d1-4d2f-41fd-ac54-cc63a8de7b3c",
            "979c5847-2933-4887-b7fd-05f878541734",
            "376de8d7-fb33-4f62-be5a-b9044492c283",
            "bcfce196-f980-45ec-9dfb-16ca53c1c6bf",
            "4cec7cc1-8e3e-45e3-866e-d800c15fef66",
            "90fd763a-b0e8-4296-986b-e2b18af93a4a",
            "7cc6d0c4-5832-45da-887f-502a70a914bf",
            "7692d1fe-db5b-4ba5-9e19-21957a3c17d0",
            "f2b4ceed-f4b7-4acf-bc91-903cc746807f",
            "16d62b26-dc46-4ebc-94e2-908dc964b6cf",
            "07975ab9-2b1d-40d4-88f0-9cff7a8c8fb8",
            "cb495b8c-586a-4245-a4c6-a4e19e5abe38",
            "5e40582c-f1e1-45b7-be7c-9e9a2da03c95",
            "ff4ab35b-9b76-41a1-a6ee-36bc56d31462",
            "a838727e-81c8-4834-af4e-f33b520fd1e1",
            "517790a5-db10-491c-bb92-6bb654e36795",
            "1234b7ba-540f-4a21-8d5c-d0a729a315ed",
            "166f2724-ea07-47ba-b33e-15b5365b84b0",
        ],
    },
    "exam2-diverse": {
        "exam_key": "exam2",
        "contest_id": "10ad193f-5113-456a-808a-4d20e057203d",
        "description": "Exam2 three-question pilot: list, explanation, pros/cons.",
        "question_ids": [
            "5b9d59d3-4c5a-44ff-81ff-932d69c8cf82",
            "a89c0767-a955-4b8d-927f-d01e3d954cc0",
            "8bd69984-3cd8-48b1-9da3-4c040620959e",
        ],
    },
    "exam2-subjective": {
        "exam_key": "exam2",
        "contest_id": "10ad193f-5113-456a-808a-4d20e057203d",
        "description": "Exam2 all subjective/short-answer questions.",
        "question_ids": [
            "8c09a796-304f-491d-910b-126c7178a25d",
            "d84cb3ab-a1d9-4f09-9ae9-78c9411ccb46",
            "9bdf83bb-ecc7-4de2-b1c0-35a83aa6580e",
            "b8fea8c6-21b2-4e68-8da7-540504d18b30",
            "de117ea3-bbad-4bd2-9aff-86840d03ef2d",
            "df612ec1-2475-4919-9f33-0fc639c9507a",
            "5b9d59d3-4c5a-44ff-81ff-932d69c8cf82",
            "c0681a88-9d0b-4390-a509-4814a70e67fd",
            "d8e28def-51f9-4f18-b828-1e458ebf90f2",
            "37861c97-e01d-4371-a51e-bd04e4cfd84d",
            "a94192ac-fcd6-4d22-a85f-0650a6e3d742",
            "0a0d5e7d-9e62-409b-ba1f-fc5a70b32017",
            "f1a002fc-be46-42b5-8f42-958c06c6cd46",
            "9ec3f4b7-57c6-41f8-bdc2-abd8b9614be7",
            "a89c0767-a955-4b8d-927f-d01e3d954cc0",
            "e74dd4e1-7f62-4da6-b965-e65834bf10fc",
            "8edb59fe-821f-4597-a8e4-0bb11146517d",
            "8bd69984-3cd8-48b1-9da3-4c040620959e",
            "e7ffda48-61f1-4aad-8337-1ba266c0c951",
        ],
    },
    "exam3-subjective": {
        "exam_key": "exam3",
        "contest_id": "d4edfae6-c286-4edc-911c-14aed410f503",
        "description": "Exam3 all subjective/short-answer questions (114下 OS 第二次考試).",
        "question_ids": [
            "239f665c-adac-4c92-868d-3868e6df3c29",
            "8d229fe3-fa8c-45fb-a560-65b5b00a915a",
            "be2ff616-0006-4b10-8976-b7fc9fc920e5",
            "e3572dd2-f9f1-429a-86fc-adb4cfb1d05b",
            "e1a4ae63-c63b-476e-9cfa-f7629aa4ba5e",
            "7450802f-c278-4f46-86df-c4f76950b05d",
            "ec39ce08-2e77-4e08-b2e9-c2f550a14027",
            "b6817d9c-93b7-4444-b0b6-8e2e57e803bb",
            "7c8ccf8f-c88b-4267-8c89-f75c540ad82f",
            "e0e7fb6b-4497-4653-adcd-7c533eeba109",
            "1e9747dc-29f2-4075-b4c0-e5477c8a4fe9",
            "47c20268-e5ba-4c51-923a-3fc0c067d95c",
            "f6d2d163-401a-4fbc-abc9-ee4368209f5d",
            "2f935d79-4782-401b-8fcf-76e4388561ea",
            "bae5f1a8-52da-4f83-a277-6ce42ce8410e",
            "0687ba99-8ee9-4ee2-a2ca-068603e075ac",
            "ef4f48a4-63ec-4de2-b23a-87a79f9023f6",
            "927d5d2b-d44c-489b-83a4-cd979949b351",
        ],
    },
}

SUMMARY_COLUMNS = [
    "experiment_id",
    "exam_key",
    "preset",
    "contest_id",
    "question_id",
    "question_order",
    "question_type",
    "max_score",
    "answer_count",
    "scored_count",
    "blank_score_count",
    "model_id",
    "run_status",
    "terminal_event_type",
    "started_at",
    "ended_at",
    "elapsed_seconds",
    "input_tokens",
    "output_tokens",
    "cost_cents",
    "cost_usd",
    "session_id",
    "run_id",
    "prompt_preview",
    "run_dir",
    "grade_csv_path",
    "rubric_path",
]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def safe_path_segment(value: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
    return sanitized or "unknown"


def _question_id(item: dict[str, Any]) -> str | None:
    value = item.get("question_id") or item.get("id")
    return str(value) if value else None


def build_question_metadata(
    questions: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    metadata: dict[str, dict[str, Any]] = {}
    for question in questions:
        question_id = _question_id(question)
        if question_id:
            metadata[question_id] = question
    return metadata


def load_dataset_question(dataset_dir: Path, question_id: str) -> dict[str, Any]:
    questions_path = dataset_dir / "questions.json"
    questions = json.loads(questions_path.read_text(encoding="utf-8"))
    if not isinstance(questions, list):
        raise RuntimeError(f"Invalid questions.json in {dataset_dir}")
    for question in questions:
        if isinstance(question, dict) and _question_id(question) == question_id:
            return question
    raise RuntimeError(f"Question {question_id} not found in {questions_path}")


def load_dataset_answers(dataset_dir: Path, question_id: str) -> list[dict[str, Any]]:
    answers_path = dataset_dir / "answers.jsonl"
    answers: list[dict[str, Any]] = []
    with answers_path.open("r", encoding="utf-8") as fh:
        for line in fh:
            raw = json.loads(line)
            if not isinstance(raw, dict):
                continue
            if str(raw.get("question_id") or "") != question_id:
                continue
            answers.append(
                {
                    "id": str(raw.get("exam_answer_id") or ""),
                    "participant_username": raw.get("subject_id") or "",
                    "answer": {"text": raw.get("answer_text") or ""},
                    "score": raw.get("human_score"),
                    "feedback": raw.get("human_feedback") or "",
                }
            )
    if not answers:
        raise RuntimeError(f"No answers for question {question_id} in {answers_path}")
    return answers


def load_dataset_metadata(dataset_dir: Path) -> dict[str, dict[str, Any]]:
    questions_path = dataset_dir / "questions.json"
    questions = json.loads(questions_path.read_text(encoding="utf-8"))
    if not isinstance(questions, list):
        return {}
    return build_question_metadata([q for q in questions if isinstance(q, dict)])


def latest_usage_report(events_path: Path) -> dict[str, Any] | None:
    if not events_path.exists():
        return None
    latest: dict[str, Any] | None = None
    with events_path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            event = json.loads(line)
            if event.get("type") == "usage_report":
                latest = event
    return latest


def _load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def _question_context(run_dir: Path) -> dict[str, Any]:
    return _load_json(run_dir / "question_context.json")


def _input_snapshot(run_dir: Path) -> dict[str, Any]:
    return _load_json(run_dir / "input_snapshot.json")


def _coalesce(*values: Any) -> Any:
    for value in values:
        if value is not None and value != "":
            return value
    return ""


def _prompt_preview(prompt: Any, limit: int = 160) -> str:
    text = " ".join(str(prompt or "").split())
    return text[:limit]


def grade_score_counts(grade_csv_path: Path) -> tuple[int, int]:
    if not grade_csv_path.exists():
        return 0, 0
    with grade_csv_path.open("r", encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    scored_count = sum(1 for row in rows if str(row.get("score") or "").strip())
    return scored_count, len(rows) - scored_count


def build_summary_row(
    *,
    experiment_id: str,
    exam_key: str | None,
    preset: str | None,
    manifest: dict[str, Any],
    run_dir: Path,
    question_metadata: dict[str, Any] | None,
    started_at: str,
    ended_at: str,
    elapsed_seconds: float,
) -> dict[str, str]:
    context = _question_context(run_dir)
    snapshot = _input_snapshot(run_dir)
    usage = latest_usage_report(run_dir / "run_events.jsonl") or {}
    metadata = question_metadata or {}

    cost_cents = _coalesce(usage.get("cost_cents"), "")
    cost_usd = ""
    if cost_cents != "":
        cost_usd = f"{int(cost_cents) / 100:.4f}"

    question_id = str(manifest.get("question_id") or "")
    terminal_event_type = str(manifest.get("terminal_event_type") or "")
    run_status = str(
        _coalesce(
            terminal_event_type.removeprefix("run_") if terminal_event_type else "",
            usage.get("run_status"),
        )
    )

    grade_csv_path = run_dir / "grade.csv"
    rubric_path = run_dir / "rubric.md"
    scored_count, blank_score_count = grade_score_counts(grade_csv_path)
    prompt = _coalesce(metadata.get("prompt"), context.get("prompt"), "")

    return {
        "experiment_id": experiment_id,
        "exam_key": exam_key or "",
        "preset": preset or "",
        "contest_id": str(manifest.get("contest_id") or ""),
        "question_id": question_id,
        "question_order": str(_coalesce(metadata.get("order"), "")),
        "question_type": str(
            _coalesce(metadata.get("question_type"), context.get("question_type"), "")
        ),
        "max_score": str(
            _coalesce(metadata.get("max_score"), metadata.get("score"), context.get("max_score"), "")
        ),
        "answer_count": str(
            _coalesce(metadata.get("answer_count"), snapshot.get("answer_count"), "")
        ),
        "scored_count": str(scored_count),
        "blank_score_count": str(blank_score_count),
        "model_id": str(manifest.get("model_id") or ""),
        "run_status": run_status,
        "terminal_event_type": terminal_event_type,
        "started_at": started_at,
        "ended_at": ended_at,
        "elapsed_seconds": f"{elapsed_seconds:.3f}",
        "input_tokens": str(_coalesce(usage.get("input_tokens"), "")),
        "output_tokens": str(_coalesce(usage.get("output_tokens"), "")),
        "cost_cents": str(cost_cents),
        "cost_usd": cost_usd,
        "session_id": str(manifest.get("session_id") or ""),
        "run_id": str(manifest.get("run_id") or ""),
        "prompt_preview": _prompt_preview(prompt),
        "run_dir": str(run_dir),
        "grade_csv_path": str(grade_csv_path) if grade_csv_path.exists() else "",
        "rubric_path": str(rubric_path) if rubric_path.exists() else "",
    }


def build_error_summary_row(
    *,
    experiment_id: str,
    exam_key: str | None,
    preset: str | None,
    contest_id: str,
    question_id: str,
    model_id: str,
    run_dir: Path,
    question_metadata: dict[str, Any] | None,
    started_at: str,
    ended_at: str,
    elapsed_seconds: float,
    error: BaseException,
) -> dict[str, str]:
    metadata = question_metadata or {}
    context = _question_context(run_dir)
    snapshot = _input_snapshot(run_dir)
    grade_csv_path = run_dir / "grade.csv"
    rubric_path = run_dir / "rubric.md"
    scored_count, blank_score_count = grade_score_counts(grade_csv_path)
    prompt = _coalesce(metadata.get("prompt"), context.get("prompt"), "")
    error_path = run_dir / "error.json"
    run_dir.mkdir(parents=True, exist_ok=True)
    error_path.write_text(
        json.dumps(
            {
                "error_type": type(error).__name__,
                "error": str(error),
                "ended_at": ended_at,
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    return {
        "experiment_id": experiment_id,
        "exam_key": exam_key or "",
        "preset": preset or "",
        "contest_id": contest_id,
        "question_id": question_id,
        "question_order": str(_coalesce(metadata.get("order"), "")),
        "question_type": str(
            _coalesce(metadata.get("question_type"), context.get("question_type"), "")
        ),
        "max_score": str(
            _coalesce(metadata.get("max_score"), metadata.get("score"), context.get("max_score"), "")
        ),
        "answer_count": str(
            _coalesce(metadata.get("answer_count"), snapshot.get("answer_count"), "")
        ),
        "scored_count": str(scored_count),
        "blank_score_count": str(blank_score_count),
        "model_id": model_id,
        "run_status": "error",
        "terminal_event_type": "exception",
        "started_at": started_at,
        "ended_at": ended_at,
        "elapsed_seconds": f"{elapsed_seconds:.3f}",
        "input_tokens": "",
        "output_tokens": "",
        "cost_cents": "",
        "cost_usd": "",
        "session_id": "",
        "run_id": "",
        "prompt_preview": _prompt_preview(prompt),
        "run_dir": str(run_dir),
        "grade_csv_path": str(grade_csv_path) if grade_csv_path.exists() else "",
        "rubric_path": str(rubric_path) if rubric_path.exists() else "",
    }


def write_experiment_outputs(
    *,
    experiment_dir: Path,
    manifest: dict[str, Any],
    rows: list[dict[str, str]],
) -> None:
    write_manifest(experiment_dir / "experiment_manifest.json", manifest)

    summary_csv = experiment_dir / "summary.csv"
    with summary_csv.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=SUMMARY_COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    total_cost_cents = sum(int(row["cost_cents"] or 0) for row in rows)
    total_input_tokens = sum(int(row["input_tokens"] or 0) for row in rows)
    total_output_tokens = sum(int(row["output_tokens"] or 0) for row in rows)
    total_elapsed_seconds = sum(float(row["elapsed_seconds"] or 0) for row in rows)
    completed_count = sum(
        1
        for row in rows
        if row["terminal_event_type"] == "run_completed"
        or row["run_status"] == "completed"
    )

    summary = {
        "experiment_id": manifest["experiment_id"],
        "run_count": len(rows),
        "completed_count": completed_count,
        "total_elapsed_seconds": round(total_elapsed_seconds, 3),
        "total_input_tokens": total_input_tokens,
        "total_output_tokens": total_output_tokens,
        "total_cost_cents": total_cost_cents,
        "total_cost_usd": round(total_cost_cents / 100, 4),
        "summary_csv": str(summary_csv),
        "runs": rows,
    }
    (experiment_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def run_grading_experiment(
    *,
    client: Any,
    classroom_id: str | None,
    contest_id: str,
    question_ids: list[str],
    model_ids: list[str],
    output_root: Path,
    user_id: str | None = None,
    preset: str | None = None,
    exam_key: str | None = None,
    run_name: str | None = None,
    dataset_dir: Path | None = None,
    concurrency: int = 1,
    client_factory: Callable[[], Any] | None = None,
    run_pairs: list[tuple[str, str]] | None = None,
) -> dict[str, Any]:
    experiment_id = run_name or time.strftime("%Y%m%d-%H%M%S")
    experiment_dir = output_root / safe_path_segment(experiment_id)
    experiment_dir.mkdir(parents=True, exist_ok=True)
    resolved_concurrency = max(1, int(concurrency or 1))

    if dataset_dir is not None:
        question_metadata = load_dataset_metadata(dataset_dir)
    else:
        try:
            question_metadata = build_question_metadata(
                client.list_subjective_questions(contest_id)
            )
        except Exception:
            question_metadata = {}

    rows: list[dict[str, str]] = []
    started_at = utc_now_iso()
    manifest = {
        "cli_version": __version__,
        "experiment_id": experiment_id,
        "preset": preset,
        "exam_key": exam_key,
        "user_id": user_id,
        "classroom_id": classroom_id,
        "contest_id": contest_id,
        "question_ids": question_ids,
        "model_ids": model_ids,
        "dataset_dir": str(dataset_dir) if dataset_dir else None,
        "started_at": started_at,
        "ended_at": None,
        "run_count": len(run_pairs) if run_pairs is not None else len(question_ids) * len(model_ids),
        "concurrency": resolved_concurrency,
        "run_pairs": [
            {"question_id": question_id, "model_id": model_id}
            for question_id, model_id in (run_pairs or [])
        ],
        "official_grades_modified": False,
    }
    write_experiment_outputs(
        experiment_dir=experiment_dir,
        manifest=manifest,
        rows=rows,
    )

    task_pairs = run_pairs or [
        (question_id, model_id)
        for question_id in question_ids
        for model_id in model_ids
    ]
    tasks = [
        (index, question_id, model_id)
        for index, (question_id, model_id) in enumerate(task_pairs)
    ]
    rows_by_index: dict[int, dict[str, str]] = {}

    def run_one(index: int, question_id: str, model_id: str) -> tuple[int, dict[str, str]]:
        worker_client = client_factory() if client_factory else client
        try:
            run_dir = (
                experiment_dir
                / "runs"
                / safe_path_segment(question_id)
                / safe_path_segment(model_id)
            )
            run_started_at = utc_now_iso()
            monotonic_start = time.monotonic()
            question_override = None
            answers_override = None
            if dataset_dir is not None:
                question_override = load_dataset_question(dataset_dir, question_id)
                answers_override = load_dataset_answers(dataset_dir, question_id)
            elapsed = time.monotonic() - monotonic_start
            try:
                grading_manifest = run_question_grading(
                    client=worker_client,
                    classroom_id=classroom_id,
                    contest_id=contest_id,
                    question_id=question_id,
                    model_id=model_id,
                    output_dir=run_dir,
                    user_id=user_id,
                    question_override=question_override,
                    answers_override=answers_override,
                )
                elapsed = time.monotonic() - monotonic_start
                run_ended_at = utc_now_iso()
                return index, build_summary_row(
                    experiment_id=experiment_id,
                    exam_key=exam_key,
                    preset=preset,
                    manifest=grading_manifest,
                    run_dir=run_dir,
                    question_metadata=question_metadata.get(question_id),
                    started_at=run_started_at,
                    ended_at=run_ended_at,
                    elapsed_seconds=elapsed,
                )
            except Exception as exc:
                elapsed = time.monotonic() - monotonic_start
                run_ended_at = utc_now_iso()
                return index, build_error_summary_row(
                    experiment_id=experiment_id,
                    exam_key=exam_key,
                    preset=preset,
                    contest_id=contest_id,
                    question_id=question_id,
                    model_id=model_id,
                    run_dir=run_dir,
                    question_metadata=question_metadata.get(question_id),
                    started_at=run_started_at,
                    ended_at=run_ended_at,
                    elapsed_seconds=elapsed,
                    error=exc,
                )
        finally:
            if client_factory and hasattr(worker_client, "close"):
                worker_client.close()

    if resolved_concurrency == 1:
        for task in tasks:
            index, row = run_one(*task)
            rows_by_index[index] = row
            rows = [rows_by_index[i] for i in sorted(rows_by_index)]
            write_experiment_outputs(
                experiment_dir=experiment_dir,
                manifest=manifest,
                rows=rows,
            )
    else:
        with ThreadPoolExecutor(max_workers=resolved_concurrency) as executor:
            futures = [executor.submit(run_one, *task) for task in tasks]
            for future in as_completed(futures):
                index, row = future.result()
                rows_by_index[index] = row
                rows = [rows_by_index[i] for i in sorted(rows_by_index)]
                write_experiment_outputs(
                    experiment_dir=experiment_dir,
                    manifest=manifest,
                    rows=rows,
                )

    manifest["ended_at"] = utc_now_iso()
    write_experiment_outputs(
        experiment_dir=experiment_dir,
        manifest=manifest,
        rows=rows,
    )
    return {
        "experiment_dir": experiment_dir,
        "manifest": manifest,
        "rows": rows,
        "summary_csv": experiment_dir / "summary.csv",
        "summary_json": experiment_dir / "summary.json",
    }
