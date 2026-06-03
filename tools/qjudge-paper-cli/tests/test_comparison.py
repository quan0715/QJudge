import csv
import json
from pathlib import Path

from qjudge_paper_cli.comparison import (
    compare_grade_files,
    parse_candidate_spec,
    vote_scores,
    write_comparison_outputs,
)


def _write(path: Path, content: str) -> Path:
    path.write_text(content, encoding="utf-8")
    return path


def test_vote_scores_uses_majority_when_two_models_agree():
    vote = vote_scores([2.0, 2.0, 1.0])

    assert vote["consensus_score"] == 2.0
    assert vote["consensus_method"] == "majority"
    assert vote["score_range"] == 1.0
    assert vote["needs_review"] is True


def test_vote_scores_uses_median_when_all_models_disagree():
    vote = vote_scores([0.0, 1.0, 2.0])

    assert vote["consensus_score"] == 1.0
    assert vote["consensus_method"] == "median"
    assert vote["needs_review"] is True


def test_compare_grade_files_outputs_model_and_consensus_metrics(tmp_path: Path):
    human = _write(
        tmp_path / "human_baseline.csv",
        "\n".join(
            [
                "index,exam_answer_id,username,original_score,original_feedback",
                "1,a1,s1,2,ok",
                "2,a2,s2,1,partial",
            ]
        )
        + "\n",
    )
    model_a = _write(
        tmp_path / "model_a.csv",
        "index,exam_answer_id,username,answer_text,score,reason,synced\n"
        "1,a1,s1,answer,2,good,\n"
        "2,a2,s2,answer,1,partial,\n",
    )
    model_b = _write(
        tmp_path / "model_b.csv",
        "index,exam_answer_id,username,answer_text,score,reason,synced\n"
        "1,a1,s1,answer,2,good,\n"
        "2,a2,s2,answer,0,miss,\n",
    )
    model_c = _write(
        tmp_path / "model_c.csv",
        "index,exam_answer_id,username,answer_text,score,reason,synced\n"
        "1,a1,s1,answer,1,too strict,\n"
        "2,a2,s2,answer,1,partial,\n",
    )

    rows, metrics = compare_grade_files(
        human_baseline_path=human,
        candidate_grade_paths={
            "model_a": model_a,
            "model_b": model_b,
            "model_c": model_c,
        },
    )

    assert rows[0]["consensus_score"] == "2"
    assert rows[0]["consensus_method"] == "majority"
    assert rows[1]["consensus_score"] == "1"
    assert metrics["answer_count"] == 2
    assert metrics["models"]["model_a"]["exact_agreement"] == 1.0
    assert metrics["models"]["consensus"]["mae"] == 0.0


def test_write_comparison_outputs_creates_csv_and_metrics(tmp_path: Path):
    output_csv = tmp_path / "summary.csv"
    metrics_json = tmp_path / "summary.metrics.json"

    write_comparison_outputs(
        summary_rows=[{"exam_answer_id": "a1", "consensus_score": "2"}],
        metrics={"answer_count": 1},
        output_csv=output_csv,
        metrics_json=metrics_json,
    )

    with output_csv.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    metrics = json.loads(metrics_json.read_text(encoding="utf-8"))

    assert rows == [{"exam_answer_id": "a1", "consensus_score": "2"}]
    assert metrics == {"answer_count": 1}


def test_parse_candidate_spec_requires_id_and_path():
    candidate_id, path = parse_candidate_spec("model_a=/tmp/grade.csv")

    assert candidate_id == "model_a"
    assert path == Path("/tmp/grade.csv")
