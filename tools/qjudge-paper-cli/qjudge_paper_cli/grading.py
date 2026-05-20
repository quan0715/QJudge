from __future__ import annotations

import csv
import json
import time
from io import StringIO
from pathlib import Path
from typing import Any

from .artifacts import download_text_artifacts
from .manifest import write_manifest
from . import __version__


GRADE_CSV_COLUMNS = [
    "index",
    "exam_answer_id",
    "username",
    "answer_text",
    "original_score",
    "original_feedback",
    "score",
    "reason",
    "synced",
]


def stringify_answer(answer: Any) -> str:
    if isinstance(answer, dict):
        text = answer.get("text")
        if isinstance(text, str) and text.strip():
            return text
        selected = answer.get("selected")
        if isinstance(selected, (str, int, float)):
            return str(selected)
        if isinstance(selected, list):
            return ", ".join(str(item) for item in selected)
        code = answer.get("code")
        if isinstance(code, str) and code.strip():
            return code
    try:
        return json.dumps(answer, ensure_ascii=False, indent=2)
    except TypeError:
        return ""


def build_seed_grade_csv(rows: list[dict[str, Any]]) -> str:
    output = StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=GRADE_CSV_COLUMNS,
        quoting=csv.QUOTE_ALL,
        lineterminator="\n",
    )
    writer.writeheader()
    for index, row in enumerate(rows, start=1):
        writer.writerow(
            {
                "index": index,
                "exam_answer_id": row.get("id", ""),
                "username": row.get("participant_username")
                or row.get("username")
                or row.get("participant_user_id")
                or "",
                "answer_text": stringify_answer(row.get("answer")),
                "original_score": row.get("score") if row.get("score") is not None else "",
                "original_feedback": row.get("feedback") or "",
                "score": "",
                "reason": "",
                "synced": "",
            }
        )
    return output.getvalue()


def build_grading_prompt(contest_id: str, question_id: str) -> str:
    return "\n".join(
        [
            "請協助批改這題申論/短答題，必要時可參考 `qjudge-exam-grading-sop` 技能的評分原則。",
            "",
            "Input：",
            f"- contest_id: {contest_id}",
            f"- grading_question_id: {question_id}",
            "- `grade.csv` 已由 QJudge Paper CLI 建立，欄位固定為：index, exam_answer_id, username, answer_text, original_score, original_feedback, score, reason, synced。",
            "- 請用 artifact_read(filename=\"grade.csv\") 讀取學生作答，並用 qjudge_grading 等工具取得題目、滿分與參考解答/評分說明。",
            "",
            "Output：",
            "- 開始後請建立對應 TODO，至少包含讀取資料、建立 rubric、逐筆評分、批次更新 `grade.csv`。",
            "- 先建立 `rubric.md`，根據題目、滿分、參考解答/評分說明整理本題評分準則。",
            "- 透過 artifact_csv_patch 更新同一份 `grade.csv`，key_column 固定為 exam_answer_id。",
            "- 只填寫每列的 score 與 reason；不要改動 index, exam_answer_id, username, answer_text, original_score, original_feedback, synced。",
            "- 每一筆都要實際閱讀 answer_text 後，再給出 score 與 reason。",
            "- reason 簡短說明扣分或給分依據。",
            "- 更新完 `grade.csv` 後停止；不要呼叫 qjudge_grading 寫回分數，也不要發布成績。",
        ]
    )


def run_question_grading(
    *,
    client: Any,
    classroom_id: str | None,
    contest_id: str,
    question_id: str,
    model_id: str,
    output_dir: Path,
    user_id: str | None = None,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    started_at = int(time.time())

    answers = client.grading_answers(contest_id=contest_id, question_id=question_id)
    input_snapshot = {
        "classroom_id": classroom_id,
        "contest_id": contest_id,
        "question_id": question_id,
        "answer_count": len(answers),
        "answers": answers,
    }
    (output_dir / "input_snapshot.json").write_text(
        json.dumps(input_snapshot, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    grade_csv_path = output_dir / "grade.csv"
    grade_csv_path.write_text(build_seed_grade_csv(answers), encoding="utf-8")

    session_id = client.create_ai_session()
    prompt = build_grading_prompt(contest_id, question_id)
    task_manifest = {
        "schema_version": 1,
        "task_type": "grading.question",
        "context": {
            "contest_id": contest_id,
            "question_id": question_id,
        },
        "prompt": prompt,
    }
    client.patch_ai_session_context(
        session_id=session_id,
        context={"task_manifest": task_manifest},
    )
    seed_artifact = client.upload_artifact(
        session_id=session_id,
        path=grade_csv_path,
        step="grade",
        content_type="text/csv",
    )

    run = client.start_ai_run(session_id=session_id, prompt=prompt, model_id=model_id)
    run_id = str(run.get("id") or "")
    if not run_id:
        raise RuntimeError("Backend did not return an AI run id")

    terminal_event: dict[str, Any] | None = None
    events_path = output_dir / "run_events.jsonl"
    with events_path.open("w", encoding="utf-8") as fh:
        for event in client.iter_run_events(run_id):
            fh.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")
            if event.get("type") in {"run_completed", "run_failed", "run_cancelled"}:
                terminal_event = event
                break

    downloaded = download_text_artifacts(
        client=client,
        session_id=session_id,
        output_dir=output_dir,
    )

    manifest = {
        "cli_version": __version__,
        "user_id": user_id,
        "classroom_id": classroom_id,
        "contest_id": contest_id,
        "question_id": question_id,
        "model_id": model_id,
        "session_id": session_id,
        "run_id": run_id,
        "seed_artifact_id": seed_artifact.get("id") if isinstance(seed_artifact, dict) else None,
        "downloaded_artifacts": downloaded,
        "started_at": started_at,
        "ended_at": int(time.time()),
        "terminal_event_type": terminal_event.get("type") if terminal_event else None,
        "official_grades_modified": False,
    }
    write_manifest(output_dir / "manifest.json", manifest)
    return manifest
