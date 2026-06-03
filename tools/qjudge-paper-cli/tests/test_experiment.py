import json
from pathlib import Path

from qjudge_paper_cli import experiment
from qjudge_paper_cli.experiment import (
    DEFAULT_EXPERIMENT_MODELS,
    EXPERIMENT_PRESETS,
    build_question_metadata,
    latest_usage_report,
    load_dataset_answers,
    load_dataset_question,
    run_grading_experiment,
)


def test_exam2_diverse_preset_uses_three_distinct_question_shapes():
    preset = EXPERIMENT_PRESETS["exam2-diverse"]

    assert preset["contest_id"] == "10ad193f-5113-456a-808a-4d20e057203d"
    assert preset["question_ids"] == [
        "5b9d59d3-4c5a-44ff-81ff-932d69c8cf82",
        "a89c0767-a955-4b8d-927f-d01e3d954cc0",
        "8bd69984-3cd8-48b1-9da3-4c040620959e",
    ]
    assert DEFAULT_EXPERIMENT_MODELS == [
        "deepseek-v4-flash",
        "deepseek-v4-pro",
    ]


def test_build_question_metadata_accepts_api_and_imported_ids():
    metadata = build_question_metadata(
        [
            {"id": "api-question", "order": 1},
            {"question_id": "imported-question", "order": 2},
        ]
    )

    assert metadata["api-question"]["order"] == 1
    assert metadata["imported-question"]["order"] == 2


def test_latest_usage_report_returns_last_usage_event(tmp_path: Path):
    events_path = tmp_path / "run_events.jsonl"
    events_path.write_text(
        json.dumps({"type": "usage_report", "input_tokens": 10, "cost_cents": 1})
        + "\n"
        + json.dumps({"type": "run_completed"})
        + "\n"
        + json.dumps({"type": "usage_report", "input_tokens": 20, "cost_cents": 2})
        + "\n",
        encoding="utf-8",
    )

    assert latest_usage_report(events_path) == {
        "type": "usage_report",
        "input_tokens": 20,
        "cost_cents": 2,
    }


def test_load_dataset_question_and_answers(tmp_path: Path):
    (tmp_path / "questions.json").write_text(
        json.dumps(
            [
                {
                    "question_id": "question-list",
                    "prompt": "List four methods.",
                    "max_score": 4,
                }
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    (tmp_path / "answers.jsonl").write_text(
        json.dumps(
            {
                "question_id": "question-list",
                "exam_answer_id": 12787,
                "subject_id": "S109",
                "answer_text": "polling",
                "human_score": 3.0,
                "human_feedback": "partial",
            }
        )
        + "\n",
        encoding="utf-8",
    )

    assert load_dataset_question(tmp_path, "question-list")["max_score"] == 4
    assert load_dataset_answers(tmp_path, "question-list") == [
        {
            "id": "12787",
            "participant_username": "S109",
            "answer": {"text": "polling"},
            "score": 3.0,
            "feedback": "partial",
        }
    ]


class FakeExperimentClient:
    def list_subjective_questions(self, contest_id: str):
        assert contest_id == "contest-1"
        return [
            {
                "question_id": "question-list",
                "order": 6,
                "question_type": "short_answer",
                "max_score": 4,
                "answer_count": 116,
                "prompt": "List four methods.",
            }
        ]


def test_run_grading_experiment_writes_incremental_summary(
    tmp_path: Path,
    monkeypatch,
):
    calls = []

    def fake_run_question_grading(
        *,
        client,
        classroom_id,
        contest_id,
        question_id,
        model_id,
        output_dir,
        user_id,
        question_override=None,
        answers_override=None,
    ):
        calls.append((question_id, model_id))
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "question_context.json").write_text(
            json.dumps(
                {
                    "question_id": question_id,
                    "question_type": "short_answer",
                    "prompt": "List four methods.",
                    "max_score": 4,
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (output_dir / "input_snapshot.json").write_text(
            json.dumps({"answer_count": 116}) + "\n",
            encoding="utf-8",
        )
        (output_dir / "run_events.jsonl").write_text(
            json.dumps(
                {
                    "type": "usage_report",
                    "input_tokens": 100,
                    "output_tokens": 20,
                    "cost_cents": 3,
                    "run_status": "running",
                }
            )
            + "\n"
            + json.dumps({"type": "run_completed"})
            + "\n",
            encoding="utf-8",
        )
        (output_dir / "grade.csv").write_text("exam_answer_id,score,reason\n", encoding="utf-8")
        (output_dir / "rubric.md").write_text("# Rubric\n", encoding="utf-8")
        return {
            "contest_id": contest_id,
            "question_id": question_id,
            "model_id": model_id,
            "session_id": f"session-{model_id}",
            "run_id": f"run-{model_id}",
            "terminal_event_type": "run_completed",
        }

    monkeypatch.setattr(experiment, "run_question_grading", fake_run_question_grading)

    result = run_grading_experiment(
        client=FakeExperimentClient(),
        classroom_id="classroom-1",
        contest_id="contest-1",
        question_ids=["question-list"],
        model_ids=["deepseek-v4-flash", "deepseek-v4-pro"],
        output_root=tmp_path,
        user_id="user-1",
        preset="exam2-diverse",
        exam_key="exam2",
        run_name="pilot",
    )

    assert calls == [
        ("question-list", "deepseek-v4-flash"),
        ("question-list", "deepseek-v4-pro"),
    ]
    assert result["summary_csv"].exists()
    summary = json.loads(result["summary_json"].read_text())
    assert summary["run_count"] == 2
    assert summary["completed_count"] == 2
    assert summary["total_input_tokens"] == 200
    assert summary["total_output_tokens"] == 40
    assert summary["total_cost_cents"] == 6
    assert summary["runs"][0]["question_order"] == "6"
    assert summary["runs"][0]["answer_count"] == "116"
    assert summary["runs"][0]["scored_count"] == "0"
    assert summary["runs"][0]["blank_score_count"] == "0"
    assert summary["runs"][0]["run_status"] == "completed"
    assert summary["runs"][0]["grade_csv_path"].endswith("grade.csv")
    assert "token" not in (tmp_path / "pilot" / "experiment_manifest.json").read_text()
