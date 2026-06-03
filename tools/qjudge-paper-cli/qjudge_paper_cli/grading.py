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
    "score",
    "reason",
    "synced",
]

HUMAN_BASELINE_CSV_COLUMNS = [
    "index",
    "exam_answer_id",
    "username",
    "original_score",
    "original_feedback",
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
                "score": "",
                "reason": "",
                "synced": "",
            }
        )
    return output.getvalue()


def build_human_baseline_csv(rows: list[dict[str, Any]]) -> str:
    output = StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=HUMAN_BASELINE_CSV_COLUMNS,
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
                "original_score": row.get("score") if row.get("score") is not None else "",
                "original_feedback": row.get("feedback") or "",
            }
        )
    return output.getvalue()


def build_blind_input_snapshot(
    *,
    classroom_id: str | None,
    contest_id: str,
    question_id: str,
    answers: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "classroom_id": classroom_id,
        "contest_id": contest_id,
        "question_id": question_id,
        "answer_count": len(answers),
        "blind_grading": True,
        "answers": [
            {
                "id": row.get("id", ""),
                "participant_username": row.get("participant_username")
                or row.get("username")
                or row.get("participant_user_id")
                or "",
                "answer": row.get("answer"),
            }
            for row in answers
        ],
    }


def build_question_context(question: dict[str, Any]) -> dict[str, Any]:
    return {
        "question_id": str(question.get("id") or question.get("question_id") or ""),
        "question_type": question.get("question_type"),
        "prompt": question.get("prompt") or "",
        "options": question.get("options") if isinstance(question.get("options"), list) else [],
        "max_score": question.get("score") if question.get("score") is not None else question.get("max_score"),
        "reference_answer": question.get("correct_answer"),
        "explanation": question.get("explanation") or "",
    }


def build_grading_prompt(contest_id: str, question_id: str) -> str:
    return "\n".join(
        [
            "請協助批改這題申論/短答題，開始後第一個工具操作必須用 read_file 讀取 `/app/.deepagents/skills/qjudge-exam-grading-sop/SKILL.md`，並遵守其中 CSV 批改 SOP。",
            "",
            "Input：",
            f"- contest_id: {contest_id}",
            f"- grading_question_id: {question_id}",
            "- 這是 blind grading：你不能知道、查詢、推測或使用既有人工分數與人工評語。",
            "- 請用 artifact_read(filename=\"question_context.json\") 讀取題目、滿分、正確答案/參考答案與說明。",
            "- `grade.csv` 已由 QJudge Paper CLI 建立，欄位固定為：index, exam_answer_id, username, answer_text, score, reason, synced。",
            "- 不要用 artifact_read 讀取整份 grade.csv；請用 artifact_csv_search 檢查空白 score 數量，再用 artifact_csv_to_json(filename=\"grade.csv\", columns=[\"exam_answer_id\", \"answer_text\"], where={\"score\": \"\"}, limit=20) 分批讀取學生作答。",
            "- 不要呼叫 qjudge_grading；本 run 的 tool policy 會阻擋可能暴露既有分數/評語的 qjudge_grading action。",
            "- 若任何工具輸出包含既有答案層級的 score、feedback、original_score 或 original_feedback，必須忽略，且不得將其作為評分依據；題目的 max_score 可正常使用。",
            "",
            "Output：",
            "- 開始後請建立對應 TODO，至少包含讀取資料、建立 rubric、逐筆評分、批次更新 `grade.csv`。",
            "- 先建立 `rubric.md`，根據題目、滿分、參考解答/評分說明整理本題評分準則。",
            "- 透過 artifact_csv_patch 更新同一份 `grade.csv`，key_column 固定為 exam_answer_id。",
            "- 只填寫每列的 score 與 reason；不要改動 index, exam_answer_id, username, answer_text, synced。",
            "- 每一筆都要實際閱讀 answer_text 後，再給出 score 與 reason。",
            "- reason 簡短說明扣分或給分依據。",
            "- 不要在聊天訊息中輸出逐筆評分表；逐筆分數只能寫入 `grade.csv` artifact。",
            "- 每次用 artifact_csv_to_json 讀取 score 為空的列後，必須在同一輪立即用 artifact_csv_patch 批次填入 score 與 reason，不要累積到最後才寫。",
            "- 停止前必須再次用 artifact_csv_search 查詢 `score` 為空的列；若 matched 仍大於 0，繼續 to_json + patch，不能宣告完成。",
            "- 有效 run 的完成條件是 `grade.csv` 所有列都有 score；只在聊天內容列出分數但未更新 artifact 視為未完成。",
            "- 更新完 `grade.csv` 並確認沒有空白 score 後停止；不要呼叫 qjudge_grading 寫回分數，也不要發布成績。",
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
    question_override: dict[str, Any] | None = None,
    answers_override: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    started_at = int(time.time())

    question = question_override or client.exam_question(
        contest_id=contest_id,
        question_id=question_id,
    )
    question_context = build_question_context(question)
    question_context_path = output_dir / "question_context.json"
    question_context_path.write_text(
        json.dumps(question_context, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    answers = answers_override
    if answers is None:
        answers = client.grading_answers(contest_id=contest_id, question_id=question_id)
    input_snapshot = build_blind_input_snapshot(
        classroom_id=classroom_id,
        contest_id=contest_id,
        question_id=question_id,
        answers=answers,
    )
    input_snapshot["question_context"] = question_context
    (output_dir / "input_snapshot.json").write_text(
        json.dumps(input_snapshot, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    human_baseline_path = output_dir / "human_baseline.csv"
    human_baseline_path.write_text(build_human_baseline_csv(answers), encoding="utf-8")

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
        "tool_policy": {
            "qjudge_grading": {
                "deny_actions": [
                    "list_answers",
                    "question_detail",
                    "dashboard",
                    "grade",
                    "batch_grade",
                    "ungrade",
                ],
            },
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
    question_context_artifact = client.upload_artifact(
        session_id=session_id,
        path=question_context_path,
        step="context",
        content_type="application/json",
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
        "blind_grading": True,
        "session_id": session_id,
        "run_id": run_id,
        "seed_artifact_id": seed_artifact.get("id") if isinstance(seed_artifact, dict) else None,
        "question_context_artifact_id": (
            question_context_artifact.get("id")
            if isinstance(question_context_artifact, dict)
            else None
        ),
        "human_baseline_path": str(human_baseline_path),
        "downloaded_artifacts": downloaded,
        "started_at": started_at,
        "ended_at": int(time.time()),
        "terminal_event_type": terminal_event.get("type") if terminal_event else None,
        "official_grades_modified": False,
    }
    write_manifest(output_dir / "manifest.json", manifest)
    return manifest
