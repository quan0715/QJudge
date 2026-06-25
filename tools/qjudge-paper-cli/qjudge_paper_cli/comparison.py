from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path
from statistics import median
from typing import Any


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _rows_by_answer_id(path: Path) -> dict[str, dict[str, str]]:
    rows = _read_csv(path)
    keyed: dict[str, dict[str, str]] = {}
    for row in rows:
        answer_id = row.get("exam_answer_id", "").strip()
        if answer_id:
            keyed[answer_id] = row
    return keyed


def parse_score(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def format_score(value: float | None) -> str:
    if value is None:
        return ""
    return f"{value:g}"


def vote_scores(scores: list[float]) -> dict[str, Any]:
    if not scores:
        return {
            "consensus_score": None,
            "consensus_method": "missing",
            "score_range": None,
            "vote_counts": "",
            "needs_review": True,
        }

    counts = Counter(scores)
    top_score, top_count = counts.most_common(1)[0]
    score_range = max(scores) - min(scores)
    if top_count >= 2:
        consensus_score = top_score
        method = "majority"
    else:
        consensus_score = float(median(scores))
        method = "median"

    vote_counts = ";".join(
        f"{format_score(score)}:{count}"
        for score, count in sorted(counts.items(), key=lambda item: item[0])
    )
    return {
        "consensus_score": consensus_score,
        "consensus_method": method,
        "score_range": score_range,
        "vote_counts": vote_counts,
        "needs_review": method != "majority" or score_range >= 1.0,
    }


def _score_delta(candidate_score: float | None, human_score: float | None) -> float | None:
    if candidate_score is None or human_score is None:
        return None
    return candidate_score - human_score


def _score_abs_error(
    candidate_score: float | None,
    human_score: float | None,
) -> float | None:
    delta = _score_delta(candidate_score, human_score)
    return abs(delta) if delta is not None else None


def compare_grade_files(
    *,
    human_baseline_path: Path,
    candidate_grade_paths: dict[str, Path],
) -> tuple[list[dict[str, str]], dict[str, Any]]:
    human_rows = _rows_by_answer_id(human_baseline_path)
    candidate_rows = {
        candidate_id: _rows_by_answer_id(path)
        for candidate_id, path in candidate_grade_paths.items()
    }
    candidate_ids = list(candidate_grade_paths.keys())

    summary_rows: list[dict[str, str]] = []
    metric_accumulators: dict[str, list[float]] = {
        candidate_id: [] for candidate_id in [*candidate_ids, "consensus"]
    }
    exact_counts = {candidate_id: 0 for candidate_id in [*candidate_ids, "consensus"]}
    within_half_counts = {
        candidate_id: 0 for candidate_id in [*candidate_ids, "consensus"]
    }
    comparable_counts = {
        candidate_id: 0 for candidate_id in [*candidate_ids, "consensus"]
    }

    for answer_id, human_row in human_rows.items():
        human_score = parse_score(human_row.get("original_score"))
        row: dict[str, str] = {
            "exam_answer_id": answer_id,
            "human_score": format_score(human_score),
            "human_feedback": human_row.get("original_feedback", ""),
        }
        model_scores: list[float] = []
        for candidate_id in candidate_ids:
            candidate_row = candidate_rows[candidate_id].get(answer_id, {})
            score = parse_score(candidate_row.get("score"))
            reason = candidate_row.get("reason", "")
            row[f"{candidate_id}_score"] = format_score(score)
            row[f"{candidate_id}_reason"] = reason
            delta = _score_delta(score, human_score)
            abs_error = _score_abs_error(score, human_score)
            row[f"{candidate_id}_delta_vs_human"] = format_score(delta)
            row[f"{candidate_id}_abs_error"] = format_score(abs_error)
            if score is not None:
                model_scores.append(score)
            if abs_error is not None:
                comparable_counts[candidate_id] += 1
                metric_accumulators[candidate_id].append(abs_error)
                if abs_error == 0:
                    exact_counts[candidate_id] += 1
                if abs_error <= 0.5:
                    within_half_counts[candidate_id] += 1

        vote = vote_scores(model_scores)
        consensus_score = vote["consensus_score"]
        consensus_abs_error = _score_abs_error(consensus_score, human_score)
        row["consensus_score"] = format_score(consensus_score)
        row["consensus_method"] = str(vote["consensus_method"])
        row["consensus_abs_error"] = format_score(consensus_abs_error)
        row["score_range"] = format_score(vote["score_range"])
        row["vote_counts"] = str(vote["vote_counts"])
        row["needs_review"] = "true" if vote["needs_review"] else "false"
        if consensus_abs_error is not None:
            comparable_counts["consensus"] += 1
            metric_accumulators["consensus"].append(consensus_abs_error)
            if consensus_abs_error == 0:
                exact_counts["consensus"] += 1
            if consensus_abs_error <= 0.5:
                within_half_counts["consensus"] += 1
        summary_rows.append(row)

    metrics: dict[str, Any] = {
        "human_baseline_path": str(human_baseline_path),
        "candidate_grade_paths": {
            candidate_id: str(path)
            for candidate_id, path in candidate_grade_paths.items()
        },
        "answer_count": len(summary_rows),
        "models": {},
    }
    for candidate_id in [*candidate_ids, "consensus"]:
        comparable = comparable_counts[candidate_id]
        errors = metric_accumulators[candidate_id]
        metrics["models"][candidate_id] = {
            "comparable_count": comparable,
            "exact_agreement": exact_counts[candidate_id] / comparable
            if comparable
            else None,
            "within_0_5_agreement": within_half_counts[candidate_id] / comparable
            if comparable
            else None,
            "mae": sum(errors) / comparable if comparable else None,
        }
    metrics["needs_review_count"] = sum(
        1 for row in summary_rows if row["needs_review"] == "true"
    )
    return summary_rows, metrics


def write_comparison_outputs(
    *,
    summary_rows: list[dict[str, str]],
    metrics: dict[str, Any],
    output_csv: Path,
    metrics_json: Path,
) -> None:
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    metrics_json.parent.mkdir(parents=True, exist_ok=True)

    fieldnames: list[str] = []
    for row in summary_rows:
        for key in row:
            if key not in fieldnames:
                fieldnames.append(key)

    with output_csv.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(summary_rows)
    metrics_json.write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def parse_candidate_spec(value: str) -> tuple[str, Path]:
    candidate_id, sep, raw_path = value.partition("=")
    if not sep or not candidate_id.strip() or not raw_path.strip():
        raise ValueError("candidate must use candidate_id=/path/to/grade.csv")
    return candidate_id.strip(), Path(raw_path).expanduser()
