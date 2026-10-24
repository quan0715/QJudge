"""Validate a complete grading unit before any of its child scores are written.

This enforces provenance, coverage/ownership records and arithmetic, not the
semantic correctness of an AI's rubric. Teacher review and live cases still matter.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
from decimal import Decimal, InvalidOperation

from application.batch_grading import GradePlan, GradeRow


def parse_batch_units(message: str) -> list[dict] | None:
    for line in message.splitlines():
        if line.startswith("batch_units:"):
            units = json.loads(line.split(":", 1)[1])
            if not isinstance(units, list) or not units:
                raise ValueError("批改單位設定無效")
            return units
    return None  # Legacy runs retain their original recovery semantics.


def digest(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def points(value) -> Decimal:
    try:
        if isinstance(value, bool):
            raise ValueError("分數不可為布林值")
        number = Decimal(str(value))
        if not number.is_finite() or number < 0 or number != number.quantize(Decimal(".01")):
            raise ValueError("分數必須是非負且最多兩位小數")
        return number
    except InvalidOperation as exc:
        raise ValueError("分數格式錯誤") from exc


def validate_unit(manifest: dict, context_text: str, rubric_text: str, csvs: dict[str, str]) -> dict[str, GradePlan]:
    # Generated artifacts can be valid JSON with missing fields or wrong types.
    # Report these as terminal validation failures, not retryable worker errors.
    try:
        return _validate_unit(manifest, context_text, rubric_text, csvs)
    except (KeyError, TypeError, AttributeError) as exc:
        raise ValueError("評分資料結構不完整或欄位型別錯誤，請修正後重新批改") from exc


def _validate_unit(manifest: dict, context_text: str, rubric_text: str, csvs: dict[str, str]) -> dict[str, GradePlan]:
    if digest(context_text) != manifest["context_sha256"]:
        raise ValueError("題組上下文已變動，請重新啟動批改")
    if manifest.get("rubric_sha256") and digest(rubric_text) != manifest["rubric_sha256"]:
        raise ValueError("既有評分規準被改寫，請建立新版本")
    context, rubric = json.loads(context_text), json.loads(rubric_text)
    version = manifest["rubric_version"]
    if context["rubric_version"] != version or rubric.get("version") != version:
        raise ValueError("評分規準版本不符")
    questions = {q["question_id"]: q for q in context["questions"]}
    subjective = {qid: q for qid, q in questions.items() if q["question_type"] in ("short_answer", "essay")}
    criteria = rubric.get("criteria")
    if not isinstance(criteria, list) or not criteria:
        raise ValueError("缺少評分規準細項")
    by_id, by_question = {}, {qid: {} for qid in subjective}
    for item in criteria:
        cid, qid = item["id"], item["question_id"]
        if not isinstance(cid, str) or not cid.strip() or cid in by_id or qid not in subjective:
            raise ValueError("評分細項重複或子題不存在")
        source = item.get("source_field")
        if source not in ("prompt", "explanation", "teacher_note"):
            raise ValueError("評分條件必須出自題目或教師規則，不能僅出自參考答案")
        source_question = questions.get(item.get("source_question_id"), {})
        text = context.get("teacher_note", "") if source == "teacher_note" else source_question.get(source, "")
        quote = item.get("source_quote")
        if not isinstance(quote, str) or not quote.strip() or quote not in text:
            raise ValueError("評分條件缺少可核對的原文依據")
        if not item.get("description") or not item.get("partial_credit"):
            raise ValueError("評分細項缺少說明或部分分規則")
        by_id[cid] = item
        by_question[qid][cid] = points(item["points"])
    for qid, q in subjective.items():
        if not by_question[qid] or sum(by_question[qid].values()) != points(q["max_score"]):
            raise ValueError("子題規準配分與滿分不符")
    shared = rubric.get("shared_requirements")
    if not isinstance(shared, list):
        raise ValueError("缺少共同要求的評分歸屬清單")
    seen = set()
    for requirement in shared:
        quote, cid = requirement["source_quote"], requirement["criterion_id"]
        if not isinstance(quote, str) or not quote.strip() or quote in seen or cid not in by_id:
            raise ValueError("共同要求重複或未分配評分細項")
        # The quote must really occur in every sibling's complete prompt.
        if not all(quote in q["prompt"] for q in questions.values()):
            raise ValueError("共同要求不是共用題幹原文")
        if by_id[cid]["source_field"] != "prompt":
            raise ValueError("共同要求與所屬評分細項不一致")
        seen.add(quote)
    if any(q.get("group_id") for q in questions.values()) and not shared and not str(rubric.get("shared_requirements_note", "")).strip():
        raise ValueError("題組須列出共同要求，或說明題幹僅提供背景而無獨立評分要求")
    targets = manifest["question_ids"]
    if len(set(targets)) != len(targets) or not set(targets) <= subjective.keys():
        raise ValueError("待批改子題設定無效")
    expected = {qid: set() for qid in targets}
    for student in context["students"]:
        for answer in student["answers"]:
            if answer["writable"]:
                qid, aid = answer["question_id"], str(answer["exam_answer_id"])
                if qid not in expected or aid in expected[qid] or aid == "None":
                    raise ValueError("待批改作答設定無效")
                expected[qid].add(aid)
    plans = {}
    for qid in targets:
        rows, actual = [], set()
        for record in csv.DictReader(io.StringIO(csvs[qid])):
            aid = record.get("exam_answer_id", "").strip()
            if aid in actual or aid not in expected[qid]:
                raise ValueError("批改結果含重複、唯讀或其他學生作答")
            if record.get("rubric_version") != version:
                raise ValueError("作答評分版本與規準不符")
            earned = json.loads(record.get("criterion_scores") or "null")
            if not isinstance(earned, dict) or earned.keys() != by_question[qid].keys():
                raise ValueError("作答缺少完整評分細項")
            scores = {cid: points(value) for cid, value in earned.items()}
            if any(value > by_question[qid][cid] for cid, value in scores.items()):
                raise ValueError("細項得分超出配分")
            score = points(record.get("score"))
            if sum(scores.values()) != score:
                raise ValueError("子題得分與細項加總不符")
            reason = record.get("reason", "").strip()
            if score < points(subjective[qid]["max_score"]) and not reason:
                raise ValueError("扣分缺少理由")
            actual.add(aid)
            rows.append(GradeRow(aid, float(score), reason))
        if actual != expected[qid] or not actual:
            raise ValueError("題組仍有未完成作答，尚未寫分")
        plans[qid] = GradePlan(rows, 0)
    return plans
