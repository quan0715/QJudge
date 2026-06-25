from pathlib import Path

from typer.testing import CliRunner

from qjudge_paper_cli.app import app
from qjudge_paper_cli.app import _classroom_api_id, _item_label, _resolve_classroom_api_id


def test_auth_status_reports_logged_out(tmp_path: Path):
    runner = CliRunner()

    result = runner.invoke(
        app,
        ["auth", "status"],
        env={"QJUDGE_PAPER_TOKEN_CACHE": str(tmp_path / "auth.json")},
    )

    assert result.exit_code == 1
    assert "Not logged in" in result.output


def test_classroom_api_id_prefers_uuid_over_numeric_id():
    assert _classroom_api_id({"id": 1, "uuid": "classroom-uuid"}) == "classroom-uuid"


def test_item_label_supports_bound_contest_names():
    assert _item_label({"contest_name": "Midterm", "contest_id": "contest-uuid"}) == "Midterm"


def test_item_label_supports_exam_question_prompt():
    assert _item_label({"id": "question-uuid", "prompt": "Explain paging."}) == "Explain paging."


def test_resolve_classroom_api_id_accepts_numeric_database_id():
    class FakeClient:
        def list_classrooms(self):
            return [{"id": 1, "uuid": "classroom-uuid", "name": "OS"}]

    assert _resolve_classroom_api_id(FakeClient(), "1") == "classroom-uuid"


def test_compare_command_writes_summary_and_metrics(tmp_path: Path):
    runner = CliRunner()
    human = tmp_path / "human_baseline.csv"
    model_a = tmp_path / "model_a.csv"
    model_b = tmp_path / "model_b.csv"
    model_c = tmp_path / "model_c.csv"
    output = tmp_path / "summary.csv"

    human.write_text(
        "index,exam_answer_id,username,original_score,original_feedback\n"
        "1,a1,s1,2,ok\n",
        encoding="utf-8",
    )
    for path, score in [(model_a, 2), (model_b, 2), (model_c, 1)]:
        path.write_text(
            "index,exam_answer_id,username,answer_text,score,reason,synced\n"
            f"1,a1,s1,answer,{score},reason,\n",
            encoding="utf-8",
        )

    result = runner.invoke(
        app,
        [
            "compare",
            "--human-baseline",
            str(human),
            "-c",
            f"model_a={model_a}",
            "-c",
            f"model_b={model_b}",
            "-c",
            f"model_c={model_c}",
            "--output-csv",
            str(output),
        ],
    )

    assert result.exit_code == 0
    assert output.exists()
    assert output.with_suffix(".metrics.json").exists()
    assert "Comparison completed" in result.output
