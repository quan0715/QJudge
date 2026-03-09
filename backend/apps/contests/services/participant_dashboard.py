"""Participant dashboard payload builders for admin views."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from django.utils import timezone

from apps.contests.exporters.data_service import ContestDataService
from apps.contests.models import (
    Contest,
    ContestActivity,
    ContestParticipant,
    ExamAnswer,
    ExamEvent,
    ExamEvidenceJob,
    ExamEvidenceVideo,
    ExamQuestion,
    ExamQuestionType,
    ExamStatus,
)
from apps.contests.constants import (
    EVENT_PRIORITY,
    EVENT_CATEGORY,
    EVENT_FEED_AGGREGATION_WINDOW_SECONDS,
    PENALIZED_EVENT_TYPES,
)


ACTIVE_SUBMISSION_STATUSES = {"AC", "WA", "TLE", "MLE", "RE", "CE", "SE", "KR", "NS"}


def _question_status(question: ExamQuestion, answer: ExamAnswer | None) -> dict[str, Any]:
    if answer is None:
        return {"code": "missing", "label": "未作答", "color": "gray"}
    if answer.score is None:
        return {"code": "pending", "label": "待批改", "color": "warm-gray"}
    if float(answer.score) >= float(question.score):
        return {"code": "correct", "label": "正確", "color": "green"}
    if float(answer.score) > 0:
        return {"code": "partial", "label": "部分得分", "color": "cyan"}
    return {"code": "incorrect", "label": "未得分", "color": "red"}


def _normalize_answer_value(question_type: str, value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {"raw": value}

    if question_type in (
        ExamQuestionType.TRUE_FALSE,
        ExamQuestionType.SINGLE_CHOICE,
    ):
        return {"selected": value.get("selected")}

    if question_type == ExamQuestionType.MULTIPLE_CHOICE:
        selected = value.get("selected", [])
        return {"selected": selected if isinstance(selected, list) else [selected]}

    if question_type in (ExamQuestionType.SHORT_ANSWER, ExamQuestionType.ESSAY):
        return {"text": value.get("text", "")}

    return value


def _serialize_participant(participant: ContestParticipant) -> dict[str, Any]:
    return {
        "user_id": participant.user_id,
        "username": participant.user.username,
        "nickname": participant.nickname or participant.user.username,
        "display_name": participant.nickname or participant.user.username,
        "email": getattr(participant.user, "email", ""),
        "score": participant.score,
        "rank": participant.rank,
        "joined_at": participant.joined_at.isoformat() if participant.joined_at else None,
        "started_at": participant.started_at.isoformat() if participant.started_at else None,
        "left_at": participant.left_at.isoformat() if participant.left_at else None,
        "locked_at": participant.locked_at.isoformat() if participant.locked_at else None,
        "lock_reason": participant.lock_reason,
        "violation_count": participant.violation_count,
        "submit_reason": participant.submit_reason,
        "exam_status": participant.exam_status,
    }


TIMELINE_LIMIT = 500


def _serialize_timeline(contest: Contest, participant: ContestParticipant) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []

    exam_events = ExamEvent.objects.filter(
        contest=contest,
        user_id=participant.user_id,
    ).exclude(event_type="heartbeat").order_by("-created_at")[:TIMELINE_LIMIT]
    for event in exam_events:
        items.append(
            {
                "id": f"exam-{event.id}",
                "source": "exam_event",
                "event_type": event.event_type,
                "timestamp": event.created_at.isoformat(),
                "message": "",
                "metadata": event.metadata or {},
            }
        )

    activities = ContestActivity.objects.filter(
        contest=contest,
        user_id=participant.user_id,
    ).order_by("-created_at")[:TIMELINE_LIMIT]
    for activity in activities:
        items.append(
            {
                "id": f"activity-{activity.id}",
                "source": "activity",
                "event_type": activity.action_type,
                "timestamp": activity.created_at.isoformat(),
                "message": activity.details or "",
                "metadata": {},
            }
        )

    items.sort(key=lambda item: item["timestamp"] or "", reverse=True)
    return items


def _serialize_evidence(contest: Contest, participant: ContestParticipant) -> list[dict[str, Any]]:
    videos_qs = ExamEvidenceVideo.objects.filter(
        contest=contest,
        participant=participant,
    ).select_related("suspected_by")
    jobs_qs = ExamEvidenceJob.objects.filter(
        contest=contest,
        participant=participant,
    )

    jobs_by_session: dict[str, ExamEvidenceJob] = {}
    for job in jobs_qs.order_by("-created_at"):
        session_id = job.upload_session_id or "default"
        jobs_by_session.setdefault(session_id, job)

    rows: list[dict[str, Any]] = []
    seen_sessions: set[str] = set()
    for video in videos_qs.order_by("-updated_at", "-created_at"):
        session_id = video.upload_session_id or "default"
        seen_sessions.add(session_id)
        job = jobs_by_session.get(session_id)
        rows.append(
            {
                "id": video.id,
                "upload_session_id": session_id,
                "has_video": True,
                "job_status": job.status if job else "success",
                "job_error_message": job.error_message if job else "",
                "duration_seconds": video.duration_seconds,
                "frame_count": video.frame_count,
                "size_bytes": video.size_bytes,
                "is_suspected": video.is_suspected,
                "suspected_note": video.suspected_note,
                "suspected_by_username": getattr(video.suspected_by, "username", None),
                "updated_at": video.updated_at.isoformat(),
                "created_at": video.created_at.isoformat(),
                "video_id": video.id,
            }
        )

    for job in jobs_qs.order_by("-updated_at", "-created_at"):
        session_id = job.upload_session_id or "default"
        if session_id in seen_sessions:
            continue
        rows.append(
            {
                "id": -job.id,
                "upload_session_id": session_id,
                "has_video": False,
                "job_status": job.status,
                "job_error_message": job.error_message,
                "duration_seconds": 0,
                "frame_count": job.raw_count,
                "size_bytes": 0,
                "is_suspected": False,
                "suspected_note": "",
                "suspected_by_username": None,
                "updated_at": job.updated_at.isoformat(),
                "created_at": job.created_at.isoformat(),
                "video_id": None,
            }
        )

    rows.sort(key=lambda item: item["updated_at"] or item["created_at"] or "", reverse=True)
    return rows


def _build_paper_exam_report(contest: Contest, participant: ContestParticipant) -> tuple[dict[str, Any], dict[str, Any]]:
    questions = list(
        ExamQuestion.objects.filter(contest=contest).order_by("order", "id")
    )
    answers = {
        answer.question_id: answer
        for answer in ExamAnswer.objects.filter(participant=participant).select_related("question", "graded_by")
    }

    max_score = sum(float(question.score) for question in questions)
    total_score = 0.0
    graded_count = 0
    correct_count = 0
    overview_rows: list[dict[str, Any]] = []
    details: list[dict[str, Any]] = []

    for index, question in enumerate(questions, start=1):
        answer = answers.get(question.id)
        status = _question_status(question, answer)
        question_score = float(question.score)
        earned_score = float(answer.score) if answer and answer.score is not None else None

        if earned_score is not None:
            total_score += earned_score
            graded_count += 1
            if earned_score >= question_score:
                correct_count += 1

        overview_rows.append(
            {
                "question_id": question.id,
                "index": index,
                "question_type": question.question_type,
                "status": status,
                "score": earned_score,
                "max_score": question_score,
            }
        )

        details.append(
            {
                "question_id": question.id,
                "index": index,
                "question_type": question.question_type,
                "prompt": question.prompt,
                "options": question.options or [],
                "correct_answer": question.correct_answer,
                "answer": _normalize_answer_value(question.question_type, answer.answer if answer else {}),
                "score": earned_score,
                "max_score": question_score,
                "feedback": answer.feedback if answer else "",
                "graded_by_username": answer.graded_by.username if answer and answer.graded_by else None,
                "graded_at": answer.graded_at.isoformat() if answer and answer.graded_at else None,
                "is_correct": answer.is_correct if answer else None,
                "status": status,
            }
        )

    correct_rate = round((correct_count / graded_count) * 100, 1) if graded_count else 0.0
    overview = {
        "total_score": round(total_score, 2),
        "max_score": round(max_score, 2),
        "correct_rate": correct_rate,
        "graded_count": graded_count,
        "total_questions": len(questions),
    }
    report = {
        "overview_rows": overview_rows,
        "question_details": details,
    }
    return overview, report


def _build_coding_report(contest: Contest, participant: ContestParticipant) -> tuple[dict[str, Any], dict[str, Any]]:
    data_service = ContestDataService(contest)
    contest_problems = data_service.get_contest_problems()
    standings = data_service.calculate_standings(participant.user_id)
    submissions = data_service.get_submissions(participant.user_id)
    user_stats = standings.user_stats
    problem_stats = user_stats.problems if user_stats else {}
    start_time = contest.start_time or contest.created_at or timezone.now()

    accepted_problem_ids: set[int] = set()
    effective_submissions = 0
    effective_ac_count = 0
    for sub in submissions:
        if sub.problem_id in accepted_problem_ids:
            continue
        if sub.status not in ACTIVE_SUBMISSION_STATUSES:
            continue
        effective_submissions += 1
        if sub.status == "AC":
            effective_ac_count += 1
            accepted_problem_ids.add(sub.problem_id)

    max_score = sum(cp.score for cp in contest_problems)
    total_problems = len(contest_problems)
    total_score = user_stats.total_score if user_stats else 0
    solved = user_stats.solved if user_stats else 0
    ac_rate = round((effective_ac_count / effective_submissions) * 100, 1) if effective_submissions else 0.0

    status_counts: dict[str, int] = defaultdict(int)
    timeline_rows: list[dict[str, Any]] = []
    cumulative_rows: list[dict[str, Any]] = [{"created_at": start_time.isoformat(), "minutes_from_start": 0, "score": 0, "solved": 0}]

    solved_problem_ids: set[int] = set()
    cumulative_score = 0
    cumulative_solved = 0

    for sub in submissions:
        status_counts[sub.status] += 1
        minutes_from_start = max(int((sub.created_at - start_time).total_seconds() / 60), 0)
        problem = next((cp for cp in contest_problems if cp.problem_id == sub.problem_id), None)
        timeline_rows.append(
            {
                "submission_id": sub.id,
                "problem_id": sub.problem_id,
                "problem_label": problem.label if problem else str(sub.problem_id),
                "problem_title": problem.problem.title if problem else "",
                "status": sub.status,
                "score": sub.score,
                "language": sub.language,
                "created_at": sub.created_at.isoformat(),
                "minutes_from_start": minutes_from_start,
            }
        )

        if sub.status == "AC" and sub.problem_id not in solved_problem_ids:
            solved_problem_ids.add(sub.problem_id)
            cumulative_solved += 1
            cumulative_score += problem.score if problem else sub.score
            cumulative_rows.append(
                {
                    "created_at": sub.created_at.isoformat(),
                    "minutes_from_start": minutes_from_start,
                    "score": cumulative_score,
                    "solved": cumulative_solved,
                }
            )

    if not cumulative_rows or cumulative_rows[-1]["created_at"] != (submissions[-1].created_at.isoformat() if submissions else start_time.isoformat()):
        end_at = submissions[-1].created_at if submissions else start_time
        cumulative_rows.append(
            {
                "created_at": end_at.isoformat(),
                "minutes_from_start": max(int((end_at - start_time).total_seconds() / 60), 0),
                "score": cumulative_score,
                "solved": cumulative_solved,
            }
        )

    # Pre-compute best submission per problem from already-fetched submissions (avoids N+1)
    best_by_problem: dict[int, Any] = {}
    for sub in submissions:
        pid = sub.problem_id
        prev = best_by_problem.get(pid)
        if prev is None:
            best_by_problem[pid] = sub
        elif sub.status == "AC" and prev.status != "AC":
            best_by_problem[pid] = sub
        elif sub.status == "AC" and prev.status == "AC":
            best_by_problem[pid] = sub  # last AC
        elif prev.status != "AC" and (sub.score, sub.created_at) > (prev.score, prev.created_at):
            best_by_problem[pid] = sub

    grid_rows: list[dict[str, Any]] = []
    detail_rows: list[dict[str, Any]] = []
    for cp in contest_problems:
        stat = problem_stats.get(cp.problem_id) if user_stats else None
        best_submission = best_by_problem.get(cp.problem_id)
        row = {
            "problem_id": cp.problem_id,
            "label": cp.label,
            "title": cp.problem.title,
            "difficulty": cp.problem.difficulty,
            "status": stat.status if stat else None,
            "score": stat.score if stat else 0,
            "max_score": stat.max_score if stat else cp.score,
            "tries": stat.tries if stat else 0,
            "time": stat.time if stat else None,
        }
        grid_rows.append(row)
        detail_rows.append(
            {
                **row,
                "best_submission": {
                    "id": best_submission.id,
                    "status": best_submission.status,
                    "score": best_submission.score,
                    "language": best_submission.language,
                    "created_at": best_submission.created_at.isoformat(),
                } if best_submission else None,
            }
        )

    overview = {
        "total_score": total_score,
        "max_score": max_score,
        "solved": solved,
        "total_problems": total_problems,
        "rank": standings.rank,
        "total_participants": standings.total_participants,
        "effective_submissions": effective_submissions,
        "accepted_submissions": effective_ac_count,
        "accepted_rate": ac_rate,
    }
    report = {
        "problem_grid": grid_rows,
        "problem_details": detail_rows,
        "trend": {
            "submission_timeline": timeline_rows,
            "cumulative_progress": cumulative_rows,
            "status_counts": dict(status_counts),
        },
    }
    return overview, report


def _serialize_event_feed(contest: Contest, participant: ContestParticipant) -> list[dict[str, Any]]:
    """Build aggregated event feed with 60s-window incident grouping."""
    window = EVENT_FEED_AGGREGATION_WINDOW_SECONDS

    user_name = participant.user.username

    # Fetch exam events (excluding heartbeat) in chronological order
    exam_events = list(
        ExamEvent.objects.filter(
            contest=contest,
            user_id=participant.user_id,
        ).exclude(event_type="heartbeat").order_by("created_at")
    )

    # Fetch contest activities
    activities = list(
        ContestActivity.objects.filter(
            contest=contest,
            user_id=participant.user_id,
        ).order_by("created_at")
    )

    # Aggregate exam events into incidents using (event_type, 60s window) key
    incidents: list[dict[str, Any]] = []
    # Track open incidents: event_type -> index in incidents list
    open_incidents: dict[str, int] = {}

    for event in exam_events:
        et = event.event_type
        ts = event.created_at
        meta = event.metadata or {}
        has_evidence = bool(meta.get("forced_capture_uploaded"))

        idx = open_incidents.get(et)
        if idx is not None:
            inc = incidents[idx]
            # Check if still within the 60s window from last_at
            if (ts - inc["_last_at_dt"]).total_seconds() <= window:
                inc["count"] += 1
                inc["last_at"] = ts.isoformat()
                inc["_last_at_dt"] = ts
                if has_evidence:
                    inc["evidence_count"] += 1
                inc["summary"] = meta.get("reason") or inc["summary"]
                continue

        # Start new incident
        priority = EVENT_PRIORITY.get(et, 3)
        new_inc: dict[str, Any] = {
            "incident_key": f"{et}:{ts.isoformat()}",
            "event_type": et,
            "priority": priority,
            "category": EVENT_CATEGORY.get(priority, "system"),
            "penalized": et in PENALIZED_EVENT_TYPES,
            "first_at": ts.isoformat(),
            "last_at": ts.isoformat(),
            "count": 1,
            "evidence_count": 1 if has_evidence else 0,
            "summary": meta.get("reason", ""),
            "metadata": meta,
            "source": "exam_event",
            "user_name": user_name,
            "user_id": participant.user_id,
            # Internal tracking (stripped before return)
            "_last_at_dt": ts,
        }
        incidents.append(new_inc)
        open_incidents[et] = len(incidents) - 1

    # Add ContestActivity items as individual incidents
    for activity in activities:
        at = activity.action_type
        priority = EVENT_PRIORITY.get(at, 3)
        incidents.append({
            "incident_key": f"activity:{activity.id}",
            "event_type": at,
            "priority": priority,
            "category": EVENT_CATEGORY.get(priority, "system"),
            "penalized": False,
            "first_at": activity.created_at.isoformat(),
            "last_at": activity.created_at.isoformat(),
            "count": 1,
            "evidence_count": 0,
            "summary": activity.details or "",
            "metadata": {},
            "source": "activity",
            "user_name": user_name,
            "user_id": participant.user_id,
            "_last_at_dt": activity.created_at,
        })

    # Sort by first_at descending (newest first)
    incidents.sort(key=lambda inc: inc["first_at"], reverse=True)

    # Strip internal fields
    for inc in incidents:
        inc.pop("_last_at_dt", None)

    return incidents


def build_participant_dashboard(contest: Contest, participant: ContestParticipant) -> dict[str, Any]:
    timeline = _serialize_timeline(contest, participant)
    actions = {
        "can_download_report": True,
        "can_edit_status": True,
        "can_remove_participant": True,
        "can_unlock": participant.exam_status == ExamStatus.LOCKED,
        "can_reopen_exam": participant.exam_status == ExamStatus.SUBMITTED,
        "can_approve_takeover": participant.exam_status == ExamStatus.LOCKED_TAKEOVER,
        "can_view_evidence": contest.contest_type == "paper_exam",
        "can_open_grading": contest.contest_type == "paper_exam",
    }

    event_feed = _serialize_event_feed(contest, participant)

    payload = {
        "contest_type": contest.contest_type,
        "participant": _serialize_participant(participant),
        "timeline": timeline,
        "event_feed": event_feed,
        "actions": actions,
        "overview": {},
        "report": {},
    }

    if contest.contest_type == "paper_exam":
        overview, report = _build_paper_exam_report(contest, participant)
        payload["overview"] = overview
        payload["report"] = report
        payload["evidence"] = _serialize_evidence(contest, participant)
    else:
        overview, report = _build_coding_report(contest, participant)
        payload["overview"] = overview
        payload["report"] = report

    return payload
