import csv
import json
from io import StringIO
from pathlib import Path

from qjudge_paper_cli.grading import (
    build_grading_prompt,
    build_seed_grade_csv,
    run_question_grading,
)


def test_seed_grade_csv_preserves_existing_scores_and_quotes_answers():
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
    assert rows[0]["original_score"] == "3"
    assert rows[0]["original_feedback"] == "partial"
    assert rows[0]["score"] == ""
    assert rows[0]["reason"] == ""


def test_grading_prompt_is_read_only_for_official_scores():
    prompt = build_grading_prompt("contest-1", "question-1")

    assert "contest_id: contest-1" in prompt
    assert "grading_question_id: question-1" in prompt
    assert "rubric.md" in prompt
    assert "grade.csv" in prompt
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
                "score": None,
                "feedback": "",
            }
        ]

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
        model_id="deepseek-v4-thinking",
        output_dir=tmp_path,
        user_id="user-1",
    )

    manifest = json.loads((tmp_path / "manifest.json").read_text())

    assert result["session_id"] == "session-1"
    assert (tmp_path / "input_snapshot.json").exists()
    assert (tmp_path / "grade.csv").exists()
    assert (tmp_path / "rubric.md").read_text() == "# Rubric\n"
    assert client.uploads == [
        {
            "session_id": "session-1",
            "filename": "grade.csv",
            "step": "grade",
            "content_type": "text/csv",
        }
    ]
    assert client.started_run["model_id"] == "deepseek-v4-thinking"
    assert client.context_payload["task_manifest"]["task_type"] == "grading.question"
    assert manifest["official_grades_modified"] is False
    assert "token" not in json.dumps(manifest).lower()
