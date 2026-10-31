"""Cancellation-to-download E2E for the disposable ci/e2e-stack.sh stack.

Seed the two paused states directly (no model timing dependency); cancellation,
Celery delivery, backend grading HTTP, artifact persistence and downloads are real.
Run `seed` inside backend and pipe its private JSON fixture to `verify` in ai-service.
Only the existing OAuth/MCP provider fake is used; no export code is mocked.
"""
from __future__ import annotations

import asyncio
import csv
import io
import json
import os
import sys
from datetime import UTC, datetime, timedelta
from uuid import uuid4


def seed():
    assert os.environ.get("DJANGO_SETTINGS_MODULE") == "config.settings.e2e"
    import django
    django.setup()
    from django.contrib.auth import get_user_model
    from django.db import transaction
    from rest_framework_simplejwt.tokens import AccessToken
    from apps.contests.models import Contest, ContestParticipant, ExamQuestion, ExamAnswer

    suffix = uuid4().hex[:12]
    user_model = get_user_model()
    with transaction.atomic():
        teacher = user_model.objects.create_user(
            username=f"cancel-export-{suffix}", email=f"{suffix}@example.test",
            is_staff=True, role="admin",
        )
        student = user_model.objects.create_user(
            username=f"cancel-student-{suffix}", email=f"student-{suffix}@example.test",
        )
        contest = Contest.objects.create(
            name=f"Paused export E2E {suffix}", owner=teacher, contest_type="paper_exam",
            start_time=datetime.now(UTC) - timedelta(hours=2),
            end_time=datetime.now(UTC) - timedelta(hours=1), status="published",
        )
        participant = ContestParticipant.objects.create(contest=contest, user=student)
        cases = []
        for status in ("awaiting_approval", "awaiting_user_answer"):
            questions, answers = [], []
            for index in range(2):
                question = ExamQuestion.objects.create(
                    contest=contest, question_type="essay", prompt=f"{status} {index}",
                    score=10, order=len(cases) * 2 + index,
                )
                answer = ExamAnswer.objects.create(
                    participant=participant, question=question, answer={"text": "Saved reasoning"},
                )
                questions.append(str(question.pk))
                answers.append(str(answer.pk))
            cases.append({"status": status, "questions": questions, "answers": answers})
        # stdout goes directly to the verifier, never to CI logs.
        print(json.dumps({"contest": str(contest.pk), "subject": str(teacher.pk),
                          "token": str(AccessToken.for_user(teacher)), "cases": cases}))


async def verify(fixture):
    import httpx
    from redis.asyncio import Redis
    from sqlalchemy import select
    from config import get_settings
    from domain.models import Principal, Session
    from domain.ports import CredentialLease
    from infrastructure.database.base import async_session_factory
    from infrastructure.database.models import MessageRow, RunRow, RunEventRow
    from infrastructure.database.repositories import SqlAlchemySessionRepository
    from worker.tasks import _redis_lease_store

    settings = get_settings()
    issuer = "http://fake-ai-adapters:8080"
    assert settings.qjudge_public_origin.rstrip("/") == issuer, "Only run against the disposable CI stack"
    factory = async_session_factory()
    redis = Redis.from_url(settings.ai_redis_url)
    leases = _redis_lease_store(redis)
    owner = Principal(issuer, fixture["subject"])
    async with httpx.AsyncClient(timeout=20) as http:
        issued = await http.post(f"{issuer}/issue-ai-token", json={
            "sub": owner.subject, "mcp_token": fixture["token"],
        })
        issued.raise_for_status()
        ai_headers = {"Authorization": f"Bearer {issued.json()['access_token']}"}
        backend_headers = {"Authorization": f"Bearer {fixture['token']}"}
        await leases.put(leases.key_for(owner), CredentialLease(
            subject_token=issued.json()["access_token"], mcp_token=fixture["token"],
            expires_at=datetime.now(UTC) + timedelta(minutes=5), scopes=frozenset({"mcp"}),
        ))
        model_calls = (await http.get(f"{issuer}/state")).json()["model_calls"]
        try:
            for case in fixture["cases"]:
                session_id, run_id = uuid4(), uuid4()
                unit = {"id": "saved-unit", "question_ids": case["questions"], "label": "1"}
                context = {"task_manifest": {"task_type": "grading.batch",
                                             "context": {"contest_id": fixture["contest"]}}}
                async with factory.begin() as db:
                    await SqlAlchemySessionRepository(db).create(Session(session_id, owner, "Cancel export", context))
                    db.add(RunRow(run_id=run_id, session_id=session_id, status=case["status"],
                                  kind="chat", model_id="gpt-5-nano", idempotency_key=str(run_id)))
                    await db.flush()
                    db.add_all([
                        MessageRow(session_id=session_id, run_id=run_id, ordinal=1, role="user",
                                   content="batch_units: " + json.dumps([unit])),
                        MessageRow(session_id=session_id, run_id=run_id, ordinal=2, role="assistant", content=""),
                    ])

                base = f"{settings.qjudge_backend_url}/api/v1/contests/{fixture['contest']}/exam-answers"
                scope = {"session_id": str(session_id), "run_id": str(run_id), "unit_id": unit["id"]}
                async def post(action, **payload):
                    response = await http.post(f"{base}/{action}/", headers=backend_headers, json={**scope, **payload})
                    response.raise_for_status()
                    return response.json()

                await post("grading-unit", question_ids=case["questions"])
                await post("grading-draft", rubric={"criterion": "Reasoning"}, grades=[
                    {"exam_answer_id": aid, "score": score, "feedback": feedback}
                    for aid, score, feedback in zip(case["answers"], [8, 4], ["Written grade", "Saved draft"])
                ])
                await post("grading-submit", answer_ids=[case["answers"][0]])

                api = "http://ai-service:8001/v1"
                # The normal cancel endpoint dispatches a fresh worker without a lease key.
                response = await http.post(f"{api}/runs/{run_id}/cancel", headers=ai_headers)
                response.raise_for_status()
                deadline = asyncio.get_running_loop().time() + 60
                while True:
                    response = await http.get(f"{api}/runs/{run_id}", headers=ai_headers)
                    response.raise_for_status()
                    status = response.json()["status"]
                    if status == "cancelled":
                        break
                    assert status != "failed", "Export must never turn cancellation into failure"
                    assert asyncio.get_running_loop().time() < deadline, f"Cancel stuck in {status}"
                    await asyncio.sleep(0.25)

                async def artifact_list():
                    response = await http.get(f"{api}/artifacts", headers=ai_headers,
                                              params={"session_id": str(session_id)})
                    response.raise_for_status()
                    return response.json()["results"]

                artifacts = await artifact_list()
                assert sorted(a["filename"] for a in artifacts) == ["grade.csv", "rubric.md"], case["status"]
                files = {}
                for artifact in artifacts:
                    assert artifact["produced_by_run_id"] == str(run_id)
                    response = await http.get(f"{api}/artifacts/{artifact['artifact_id']}/content", headers=ai_headers)
                    response.raise_for_status()
                    assert "attachment" in response.headers["content-disposition"]
                    files[artifact["filename"]] = response.content.decode("utf-8-sig")
                assert "Reasoning" in files["rubric.md"]
                rows = {r["exam_answer_id"]: r for r in csv.DictReader(io.StringIO(files["grade.csv"]))}
                written, draft = (rows[aid] for aid in case["answers"])
                assert float(written["official_score"]) == 8 and written["write_status"] == "ok"
                assert float(draft["draft_score"]) == 4 and draft["draft_feedback"] == "Saved draft"
                assert draft["official_score"] == "" and draft["write_status"] == "not_submitted"

                # Cancellation neither submits the remaining draft nor creates duplicate files.
                verified = await post("grading-verify")
                assert verified["retry_answer_ids"] == [case["answers"][1]]
                response = await http.post(f"{api}/runs/{run_id}/cancel", headers=ai_headers)
                response.raise_for_status()
                assert await artifact_list() == artifacts
                async with factory() as db:
                    events = (await db.scalars(select(RunEventRow.event_type).where(RunEventRow.run_id == run_id))).all()
                    assert events.count("run_cancelled") == 1
                print(f"PASS {case['status']}: cancelled, two downloads verified, partial grades preserved")
            assert (await http.get(f"{issuer}/state")).json()["model_calls"] == model_calls
        finally:
            await leases.delete(leases.key_for(owner))
            await redis.aclose()
            await factory.kw["bind"].dispose()


if __name__ == "__main__":
    if sys.argv[1:] == ["seed"]:
        seed()
    elif sys.argv[1:] == ["verify"]:
        asyncio.run(verify(json.load(sys.stdin)))
    else:
        raise SystemExit("Expected seed or verify; disposable CI stack only")
