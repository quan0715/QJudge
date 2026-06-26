import csv
import json
from io import StringIO
from pathlib import Path

from qjudge_paper_cli.grading import (
    build_blind_input_snapshot,
    build_grading_prompt,
    build_human_baseline_csv,
    build_question_context,
    build_seed_grade_csv,
    run_question_grading,
)


def test_seed_grade_csv_is_blind_and_quotes_answers():
    csv_text = build_seed_grade_csv(
        [
            {
                "id": "answer-1",
                "participant_username": "student_a",
                "answer": {"text": 'A says "hello", then newline\nnext'},
                "score": 3,
                "feedback": "partial",
            }
        ]
    )

    rows = list(csv.DictReader(StringIO(csv_text)))

    assert rows[0]["exam_answer_id"] == "answer-1"
    assert rows[0]["username"] == "student_a"
    assert rows[0]["answer_text"] == 'A says "hello", then newline\nnext'
    assert "original_score" not in rows[0]
    assert "original_feedback" not in rows[0]
    assert rows[0]["score"] == ""
    assert rows[0]["reason"] == ""


def test_human_baseline_csv_extracts_existing_scores_and_feedback():
    csv_text = build_human_baseline_csv(
        [
            {
                "id": "answer-1",
                "participant_username": "student_a",
                "answer": {"text": "answer text"},
                "score": 3,
                "feedback": "partial",
            }
        ]
    )

    rows = list(csv.DictReader(StringIO(csv_text)))

    assert rows[0] == {
        "index": "1",
        "exam_answer_id": "answer-1",
        "username": "student_a",
        "original_score": "3",
        "original_feedback": "partial",
    }


def test_blind_input_snapshot_redacts_existing_scores_and_feedback():
    snapshot = build_blind_input_snapshot(
        classroom_id="classroom-1",
        contest_id="contest-1",
        question_id="question-1",
        answers=[
            {
                "id": "answer-1",
                "participant_username": "student_a",
                "answer": {"text": "answer text"},
                "score": 3,
                "feedback": "partial",
            }
        ],
    )

    serialized = json.dumps(snapshot, ensure_ascii=False)

    assert snapshot["blind_grading"] is True
    assert snapshot["answers"][0] == {
        "id": "answer-1",
        "participant_username": "student_a",
        "answer": {"text": "answer text"},
    }
    assert "partial" not in serialized
    assert "score" not in serialized
    assert "feedback" not in serialized


def test_question_context_contains_only_question_grading_inputs():
    context = build_question_context(
        {
            "question_id": "question-1",
            "question_type": "essay",
            "prompt": "Explain DMA.",
            "options": None,
            "max_score": "2.00",
            "correct_answer": "DMA moves data without CPU per-transfer work.",
            "explanation": "Mention memory and I/O device.",
        }
    )

    assert context == {
        "question_id": "question-1",
        "question_type": "essay",
        "prompt": "Explain DMA.",
        "options": [],
        "max_score": "2.00",
        "reference_answer": "DMA moves data without CPU per-transfer work.",
        "explanation": "Mention memory and I/O device.",
    }


def test_grading_prompt_is_read_only_for_official_scores():
    prompt = build_grading_prompt("contest-1", "question-1")

    assert "contest_id: contest-1" in prompt
    assert "grading_question_id: question-1" in prompt
    assert "rubric.md" in prompt
    assert "question_context.json" in prompt
    assert "grade.csv" in prompt
    assert "blind grading" in prompt
    assert "不要呼叫 qjudge_grading" in prompt
    assert "不要呼叫 qjudge_grading 寫回分數" in prompt


class FakeGradingClient:
    def __init__(self) -> None:
        self.context_payload = None
        self.uploads = []
        self.started_run = None

    def grading_answers(self, *, contest_id: str, question_id: str):
        assert contest_id == "contest-1"
        assert question_id == "question-1"
        return [
            {
                "id": "answer-1",
                "participant_username": "student_a",
                "answer": {"text": "hello"},
                "score": 1,
                "feedback": "human note",
            }
        ]

    def exam_question(self, *, contest_id: str, question_id: str):
        assert contest_id == "contest-1"
        assert question_id == "question-1"
        return {
            "id": "question-1",
            "question_type": "essay",
            "prompt": "Explain DMA.",
            "score": "2.00",
            "correct_answer": "DMA reference answer",
            "explanation": "DMA explanation",
        }

    def create_ai_session(self):
        return "session-1"

    def patch_ai_session_context(self, *, session_id: str, context):
        assert session_id == "session-1"
        self.context_payload = context

    def upload_artifact(self, *, session_id: str, path: Path, step: str, content_type: str):
        self.uploads.append(
            {
                "session_id": session_id,
                "filename": path.name,
                "step": step,
                "content_type": content_type,
                "content": path.read_text(encoding="utf-8"),
            }
        )
        return {"id": "artifact-seed", "filename": path.name}

    def start_ai_run(self, *, session_id: str, prompt: str, model_id: str):
        self.started_run = {
            "session_id": session_id,
            "prompt": prompt,
            "model_id": model_id,
        }
        return {"id": "run-1", "status": "running"}

    def iter_run_events(self, run_id: str):
        assert run_id == "run-1"
        yield {"type": "run_started", "run_id": run_id}
        yield {"type": "run_completed", "run_id": run_id}

    def list_artifacts(self, *, session_id: str):
        assert session_id == "session-1"
        return [
            {"id": "artifact-rubric", "filename": "rubric.md", "updated_at": "now"},
            {"id": "artifact-grade", "filename": "grade.csv", "updated_at": "now"},
        ]

    def artifact_content(self, artifact_id: str):
        return {
            "artifact-rubric": "# Rubric\n",
            "artifact-grade": "exam_answer_id,score,reason\nanswer-1,1,ok\n",
        }[artifact_id]


def test_run_question_grading_creates_read_only_artifacts(tmp_path: Path):
    client = FakeGradingClient()

    result = run_question_grading(
        client=client,
        classroom_id="classroom-1",
        contest_id="contest-1",
        question_id="question-1",
        model_id="deepseek-v4-flash",
        output_dir=tmp_path,
        user_id="user-1",
    )

    manifest = json.loads((tmp_path / "manifest.json").read_text())

    assert result["session_id"] == "session-1"
    assert (tmp_path / "input_snapshot.json").exists()
    assert (tmp_path / "question_context.json").exists()
    assert (tmp_path / "human_baseline.csv").exists()
    assert (tmp_path / "grade.csv").exists()
    assert (tmp_path / "rubric.md").read_text() == "# Rubric\n"
    assert client.uploads[0]["session_id"] == "session-1"
    assert client.uploads[0]["filename"] == "grade.csv"
    assert client.uploads[0]["step"] == "grade"
    assert client.uploads[0]["content_type"] == "text/csv"
    assert "human note" not in client.uploads[0]["content"]
    assert "original_score" not in client.uploads[0]["content"]
    assert client.uploads[1]["filename"] == "question_context.json"
    assert client.uploads[1]["step"] == "context"
    assert "DMA reference answer" in client.uploads[1]["content"]
    baseline_rows = list(
        csv.DictReader(StringIO((tmp_path / "human_baseline.csv").read_text()))
    )
    assert baseline_rows[0]["original_score"] == "1"
    assert baseline_rows[0]["original_feedback"] == "human note"
    assert client.started_run["model_id"] == "deepseek-v4-flash"
    assert client.context_payload["task_manifest"]["task_type"] == "grading.question"
    assert client.context_payload["task_manifest"]["tool_policy"] == {
        "qjudge_grading": {
            "deny_actions": [
                "list_answers",
                "question_detail",
                "dashboard",
                "grade",
                "batch_grade",
                "ungrade",
            ],
        }
    }
    assert manifest["blind_grading"] is True
    assert manifest["question_context_artifact_id"] == "artifact-seed"
    assert manifest["human_baseline_path"].endswith("human_baseline.csv")
    assert manifest["official_grades_modified"] is False
    assert "token" not in json.dumps(manifest).lower()
