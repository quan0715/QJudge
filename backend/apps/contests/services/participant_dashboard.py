"""Participant dashboard payload builders for admin views."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone as datetime_timezone
from typing import Any

from django.utils import timezone

from apps.contests.exporters.data_service import ContestDataService
from apps.contests.integrity.registry import DEFINITIONS
from apps.contests.models import (
    Contest,
    ContestActivity,
    ContestParticipant,
    ExamAnswer,
    ExamEvent,
    ExamQuestion,
    ExamQuestionType,
    ExamStatus,
)
from apps.contests.services.attendance import build_participant_attendance_summary
from apps.contests.services.integrity_evidence import evidence_statuses_for_events
from apps.contests.services.integrity_event_projection import (
    event_penalized,
    event_phase,
    event_priority,
    priority_category,
)


ACTIVE_SUBMISSION_STATUSES = {"AC", "WA", "TLE", "MLE", "RE", "CE", "SE", "KR", "NS"}


def _question_status(
    question: ExamQuestion, answer: ExamAnswer | None
) -> dict[str, Any]:
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
    profile = getattr(participant.user, "profile", None)
    from apps.contests.services.integrity_presence import get_last_checkpoint
    from apps.contests.services.realtime_sfu_registry import get_publishers

    checkpoint = get_last_checkpoint(participant.contest_id, participant.user_id)
    publishers = get_publishers(participant.contest_id, participant.user_id)
    live_sources: list[str] = []
    for publisher in publishers:
        source = publisher.get("source_module") if isinstance(publisher, dict) else None
        if source in ("screen_share", "webcam") and source not in live_sources:
            live_sources.append(source)
    live_monitoring_online = bool(live_sources)
    return {
        "user_id": participant.user_id,
        "username": participant.user.username,
        "display_name": getattr(profile, "display_name", "") or "",
        "account_role": getattr(participant.user, "role", "student"),
        "auth_provider": getattr(participant.user, "auth_provider", "email"),
        "email": getattr(participant.user, "email", ""),
        "score": float(participant.score or 0),
        "rank": participant.rank,
        "joined_at": participant.joined_at.isoformat()
        if participant.joined_at
        else None,
        "started_at": participant.started_at.isoformat()
        if participant.started_at
        else None,
        "left_at": participant.left_at.isoformat() if participant.left_at else None,
        "locked_at": participant.locked_at.isoformat()
        if participant.locked_at
        else None,
        "lock_reason": participant.lock_reason,
        "violation_count": participant.violation_count,
        "submit_reason": participant.submit_reason,
        "exam_status": participant.exam_status,
        "connection_status": "live"
        if live_monitoring_online
        else ("online" if checkpoint else "offline"),
        "last_checkpoint_at": checkpoint,
        "live_monitoring_online": live_monitoring_online,
        "live_monitoring_sources": live_sources,
    }


TIMELINE_LIMIT = 500


def _serialize_timeline(
    contest: Contest, participant: ContestParticipant
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []

    exam_events = (
        ExamEvent.objects.filter(
            contest=contest,
            user_id=participant.user_id,
        )
        .exclude(event_type="health_snapshot")
        .order_by("-created_at")[:TIMELINE_LIMIT]
    )
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


def _build_paper_exam_report(
    contest: Contest, participant: ContestParticipant
) -> tuple[dict[str, Any], dict[str, Any]]:
    from .exam_scoring import ExamScoringService, ExamQuestionScorePolicy

    questions = list(
        ExamQuestion.objects.filter(contest=contest).order_by("order", "id")
    )
    answers = {
        answer.question_id: answer
        for answer in ExamAnswer.objects.filter(participant=participant).select_related(
            "question", "graded_by"
        )
    }

    scoring = ExamScoringService(contest)
    breakdown = scoring.get_participant_breakdown(participant, answers)
    effective_max = scoring.get_effective_max_scores()
    items_by_question_id = {item["question_id"]: item for item in breakdown.items}
    max_score = breakdown.max_total_score
    total_score = breakdown.total_score
    graded_count = breakdown.graded_count
    correct_count = breakdown.correct_count

    overview_rows: list[dict[str, Any]] = []
    details: list[dict[str, Any]] = []

    for index, question in enumerate(questions, start=1):
        answer = answers.get(question.id)
        policy = question.score_policy
        item = items_by_question_id.get(question.id)

        # Determine displayed score based on policy
        if policy == ExamQuestionScorePolicy.EXCLUDED:
            earned_score = None
            question_score = float(scoring._round_score(question.score))
            status = {"code": "excluded", "label": "不計分", "color": "gray"}
        elif policy == ExamQuestionScorePolicy.REDISTRIBUTE:
            earned_score = None
            question_score = None
            status = {"code": "redistribute", "label": "配分重分配", "color": "blue"}
        elif policy == ExamQuestionScorePolicy.FULL_MARKS:
            question_score = float(scoring._round_score(question.score))
            earned_score = question_score
            status = {"code": "full_marks", "label": "送分", "color": "green"}
        else:
            status = _question_status(question, answer)
            question_score = float(
                scoring._round_score(effective_max.get(question.id, question.score))
            )
            earned_score = (
                float(scoring._round_score(item["score"]))
                if item and item.get("score") is not None
                else None
            )

        overview_rows.append(
            {
                "question_id": str(question.id),
                "index": index,
                "question_type": question.question_type,
                "status": status,
                "score": earned_score,
                "max_score": question_score,
                "score_policy": policy,
            }
        )

        details.append(
            {
                "question_id": str(question.id),
                "index": index,
                "question_type": question.question_type,
                "prompt": question.prompt,
                "options": question.options or [],
                "correct_answer": question.correct_answer,
                "explanation": (
                    answer.question_snapshot.get("explanation", "")
                    if answer and answer.question_snapshot
                    else question.explanation
                ),
                "answer": _normalize_answer_value(
                    question.question_type, answer.answer if answer else {}
                ),
                "score": earned_score,
                "max_score": question_score,
                "feedback": answer.feedback if answer else "",
                "graded_by_username": answer.graded_by.username
                if answer and answer.graded_by
                else None,
                "graded_at": answer.graded_at.isoformat()
                if answer and answer.graded_at
                else None,
                "is_correct": answer.is_correct if answer else None,
                "status": status,
                "score_policy": policy,
            }
        )

    correct_rate = (
        round((correct_count / graded_count) * 100, 1) if graded_count else 0.0
    )
    overview = {
        "total_score": float(scoring._round_score(total_score)),
        "max_score": float(scoring._round_score(max_score)),
        "correct_rate": correct_rate,
        "graded_count": graded_count,
        "total_questions": len(questions),
    }
    report = {
        "overview_rows": overview_rows,
        "question_details": details,
    }
    return overview, report


def _build_coding_report(
    contest: Contest, participant: ContestParticipant
) -> tuple[dict[str, Any], dict[str, Any]]:
    data_service = ContestDataService(contest)
    contest_problems = data_service.get_contest_problems()
    standings = data_service.calculate_standings(participant.user_id)
    submissions = data_service.get_submissions(participant.user_id)
    user_stats = standings.user_stats
    problem_stats = user_stats.problems if user_stats else {}
    start_time = contest.start_time or contest.created_at or timezone.now()

    accepted_problem_ids: set[str] = set()
    effective_submissions = 0
    effective_ac_count = 0
    for sub in submissions:
        sub_problem_id = str(sub.problem_id)
        if sub_problem_id in accepted_problem_ids:
            continue
        if sub.status not in ACTIVE_SUBMISSION_STATUSES:
            continue
        effective_submissions += 1
        if sub.status == "AC":
            effective_ac_count += 1
            accepted_problem_ids.add(sub_problem_id)

    max_score = sum(cp.max_score for cp in contest_problems)
    total_problems = len(contest_problems)
    total_score = user_stats.total_score if user_stats else 0
    solved = user_stats.solved if user_stats else 0
    ac_rate = (
        round((effective_ac_count / effective_submissions) * 100, 1)
        if effective_submissions
        else 0.0
    )

    status_counts: dict[str, int] = defaultdict(int)
    timeline_rows: list[dict[str, Any]] = []
    cumulative_rows: list[dict[str, Any]] = [
        {
            "created_at": start_time.isoformat(),
            "minutes_from_start": 0,
            "score": 0,
            "solved": 0,
        }
    ]

    solved_problem_ids: set[str] = set()
    cumulative_score = 0
    cumulative_solved = 0

    for sub in submissions:
        status_counts[sub.status] += 1
        minutes_from_start = max(
            int((sub.created_at - start_time).total_seconds() / 60), 0
        )
        sub_problem_id = str(sub.problem_id)
        problem = next(
            (cp for cp in contest_problems if str(cp.problem_id) == sub_problem_id),
            None,
        )
        timeline_rows.append(
            {
                "submission_id": sub.id,
                "problem_id": sub_problem_id,
                "problem_label": problem.label if problem else sub_problem_id,
                "problem_title": problem.problem.title if problem else "",
                "status": sub.status,
                "score": sub.score,
                "language": sub.language,
                "created_at": sub.created_at.isoformat(),
                "minutes_from_start": minutes_from_start,
            }
        )

        if sub.status == "AC" and sub_problem_id not in solved_problem_ids:
            solved_problem_ids.add(sub_problem_id)
            cumulative_solved += 1
            cumulative_score += problem.max_score if problem else sub.score
            cumulative_rows.append(
                {
                    "created_at": sub.created_at.isoformat(),
                    "minutes_from_start": minutes_from_start,
                    "score": cumulative_score,
                    "solved": cumulative_solved,
                }
            )

    if not cumulative_rows or cumulative_rows[-1]["created_at"] != (
        submissions[-1].created_at.isoformat()
        if submissions
        else start_time.isoformat()
    ):
        end_at = submissions[-1].created_at if submissions else start_time
        cumulative_rows.append(
            {
                "created_at": end_at.isoformat(),
                "minutes_from_start": max(
                    int((end_at - start_time).total_seconds() / 60), 0
                ),
                "score": cumulative_score,
                "solved": cumulative_solved,
            }
        )

    # Pre-compute best submission per problem from already-fetched submissions (avoids N+1)
    best_by_problem: dict[str, Any] = {}
    for sub in submissions:
        pid = str(sub.problem_id)
        prev = best_by_problem.get(pid)
        if prev is None:
            best_by_problem[pid] = sub
        elif sub.status == "AC" and prev.status != "AC":
            best_by_problem[pid] = sub
        elif sub.status == "AC" and prev.status == "AC":
            best_by_problem[pid] = sub  # last AC
        elif prev.status != "AC" and (sub.score, sub.created_at) > (
            prev.score,
            prev.created_at,
        ):
            best_by_problem[pid] = sub

    grid_rows: list[dict[str, Any]] = []
    detail_rows: list[dict[str, Any]] = []
    for cp in contest_problems:
        problem_key = str(cp.problem_id)
        stat = problem_stats.get(problem_key) if user_stats else None
        best_submission = best_by_problem.get(problem_key)
        row = {
            "problem_id": problem_key,
            "label": cp.label,
            "title": cp.problem.title,
            "difficulty": cp.problem.difficulty,
            "status": stat.status if stat else None,
            "score": stat.score if stat else 0,
            "max_score": stat.max_score if stat else cp.max_score,
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
                }
                if best_submission
                else None,
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


def _event_occurred_at(event: ExamEvent) -> datetime:
    if event.client_occurred_at_ms is not None:
        return datetime.fromtimestamp(
            event.client_occurred_at_ms / 1000,
            tz=datetime_timezone.utc,
        )
    return event.created_at


def _has_evidence(summary: dict[str, object]) -> bool:
    sources = summary.get("evidence_sources")
    if not isinstance(sources, dict):
        return False
    return any(
        source.get("status") == "available"
        for source in sources.values()
        if isinstance(source, dict)
    )


def _manager_visible_standalone(event: ExamEvent) -> bool:
    for definition in DEFINITIONS.values():
        signals = definition.signals
        if event.event_type not in signals.values():
            continue
        lifecycle = bool(signals.get("escalated") or signals.get("restored"))
        return not lifecycle
    return True


def _incident_family(event: ExamEvent) -> str:
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    integrity = metadata.get("integrity")
    if isinstance(integrity, dict):
        definition_id = integrity.get("definition_id")
        if isinstance(definition_id, str) and definition_id:
            return definition_id
    return event.event_type


def build_event_feed(
    *,
    user_id: int,
    user_name: str,
    exam_events: list[ExamEvent],
    activities: list[ContestActivity],
    evidence_by_event: dict[int, dict[str, object]],
) -> list[dict[str, Any]]:
    """Project one user's records into a chronological semantic incident feed."""
    incident_events: dict[str, list[ExamEvent]] = {}
    standalone_events: list[ExamEvent] = []
    for event in exam_events:
        if event.incident_id is None:
            standalone_events.append(event)
        else:
            incident_events.setdefault(str(event.incident_id), []).append(event)

    occurrences: list[dict[str, Any]] = []
    for incident_id, group in incident_events.items():
        ordered = sorted(group, key=lambda event: (_event_occurred_at(event), event.id))
        escalated = [event for event in ordered if event_phase(event) == "escalated"]
        if not escalated:
            continue
        representative = escalated[-1]
        first_at = _event_occurred_at(ordered[0])
        last_at = _event_occurred_at(ordered[-1])
        phases = [event_phase(event) for event in ordered]
        status_value = (
            "restored"
            if "restored" in phases
            else "escalated"
            if "escalated" in phases
            else "active"
        )
        priority = min(event_priority(event) for event in ordered)
        evidence = evidence_by_event.get(representative.id, {})
        metadata = dict(representative.metadata or {})
        metadata.update(
            {
                "incident_id": incident_id,
                "incident_status": status_value,
                "transitions": [
                    {
                        "event_id": str(event.id),
                        "event_type": event.event_type,
                        "phase": event_phase(event),
                        "occurred_at": _event_occurred_at(event).isoformat(),
                        "occurred_at_ms": int(
                            _event_occurred_at(event).timestamp() * 1000
                        ),
                    }
                    for event in ordered
                ],
                "integrity_evidence_status": evidence.get(
                    "evidence_status", "unavailable"
                ),
                "integrity_evidence_sources": evidence.get("evidence_sources", {}),
            }
        )
        occurrences.append(
            {
                "incident_id": incident_id,
                "family": _incident_family(representative),
                "event_type": representative.event_type,
                "event_id": str(representative.id),
                "priority": priority,
                "penalized": any(event_penalized(event) for event in ordered),
                "first_at_value": first_at,
                "last_at_value": last_at,
                "has_evidence": _has_evidence(evidence),
                "summary": (representative.metadata or {}).get("reason", ""),
                "metadata": metadata,
            }
        )

    incidents: list[dict[str, Any]] = []
    episodes: list[list[dict[str, Any]]] = []
    for occurrence in sorted(
        occurrences,
        key=lambda item: (item["first_at_value"], item["incident_id"]),
    ):
        if not episodes:
            episodes.append([occurrence])
            continue
        previous = episodes[-1][-1]
        quiet_gap = occurrence["first_at_value"] - previous["last_at_value"]
        if occurrence["family"] == previous["family"] and quiet_gap <= timedelta(
            seconds=10
        ):
            episodes[-1].append(occurrence)
        else:
            episodes.append([occurrence])

    for episode in episodes:
        first = episode[0]
        representative = episode[-1]
        priority = min(item["priority"] for item in episode)
        metadata = dict(representative["metadata"])
        metadata["occurrences"] = [
            {
                "incident_id": item["incident_id"],
                "event_id": item["event_id"],
                "first_at": item["first_at_value"].isoformat(),
                "last_at": item["last_at_value"].isoformat(),
                "duration_ms": max(
                    0,
                    int(
                        (item["last_at_value"] - item["first_at_value"]).total_seconds()
                        * 1000
                    ),
                ),
                "has_evidence": item["has_evidence"],
                "transitions": item["metadata"].get("transitions", []),
            }
            for item in episode
        ]
        incidents.append(
            {
                "incident_key": (
                    f"incident:{first['incident_id']}"
                    if len(episode) == 1
                    else f"episode:{first['incident_id']}"
                ),
                "event_type": representative["event_type"],
                "event_id": representative["event_id"],
                "priority": priority,
                "category": priority_category(priority),
                "penalized": any(item["penalized"] for item in episode),
                "first_at": first["first_at_value"].isoformat(),
                "last_at": representative["last_at_value"].isoformat(),
                "count": len(episode),
                "has_evidence": any(item["has_evidence"] for item in episode),
                "summary": representative["summary"],
                "metadata": metadata,
                "source": "exam_event",
                "user_name": user_name,
                "user_id": user_id,
            }
        )

    for event in standalone_events:
        if not _manager_visible_standalone(event):
            continue
        occurred_at = _event_occurred_at(event)
        priority = event_priority(event)
        evidence = evidence_by_event.get(event.id, {})
        incidents.append(
            {
                "incident_key": f"event:{event.id}",
                "event_type": event.event_type,
                "event_id": str(event.id),
                "priority": priority,
                "category": priority_category(priority),
                "penalized": event_penalized(event),
                "first_at": occurred_at.isoformat(),
                "last_at": occurred_at.isoformat(),
                "count": 1,
                "has_evidence": _has_evidence(evidence),
                "summary": (event.metadata or {}).get("reason", ""),
                "metadata": event.metadata or {},
                "source": "exam_event",
                "user_name": user_name,
                "user_id": user_id,
            }
        )

    for activity in activities:
        at = activity.action_type
        priority = 3
        incidents.append(
            {
                "incident_key": f"activity:{activity.id}",
                "event_id": "",
                "event_type": at,
                "priority": priority,
                "category": priority_category(priority),
                "penalized": False,
                "first_at": activity.created_at.isoformat(),
                "last_at": activity.created_at.isoformat(),
                "count": 1,
                "has_evidence": False,
                "summary": activity.details or "",
                "metadata": {},
                "source": "activity",
                "user_name": user_name,
                "user_id": user_id,
            }
        )

    # Sort by first_at descending (newest first)
    incidents.sort(key=lambda inc: inc["first_at"], reverse=True)

    return incidents


def _serialize_event_feed(
    contest: Contest,
    participant: ContestParticipant,
) -> list[dict[str, Any]]:
    exam_events = list(
        ExamEvent.objects.filter(
            contest=contest,
            user_id=participant.user_id,
        )
        .exclude(event_type="health_snapshot")
        .select_related("integrity_run")
        .order_by("created_at", "id")
    )
    activities = list(
        ContestActivity.objects.filter(
            contest=contest,
            user_id=participant.user_id,
        ).order_by("created_at")
    )
    return build_event_feed(
        user_id=participant.user_id,
        user_name=participant.user.username,
        exam_events=exam_events,
        activities=activities,
        evidence_by_event=evidence_statuses_for_events(exam_events),
    )


def build_participant_dashboard(
    contest: Contest, participant: ContestParticipant
) -> dict[str, Any]:
    timeline = _serialize_timeline(contest, participant)
    actions = {
        "can_download_report": True,
        "can_edit_status": True,
        "can_remove_participant": True,
        "can_unlock": participant.exam_status == ExamStatus.LOCKED,
        "can_reopen_exam": participant.exam_status == ExamStatus.SUBMITTED,
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
        "attendance": build_participant_attendance_summary(contest, participant),
    }

    if contest.contest_type == "paper_exam":
        overview, report = _build_paper_exam_report(contest, participant)
        payload["overview"] = overview
        payload["report"] = report
    else:
        overview, report = _build_coding_report(contest, participant)
        payload["overview"] = overview
        payload["report"] = report

    return payload
