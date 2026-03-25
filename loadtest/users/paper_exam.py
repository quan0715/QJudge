"""
PaperExamUser — simulates paper-exam lifecycle without coding submissions.

Flow:
  login -> fetch contests -> enter -> start
  -> (fetch contest details + exam questions + auto-save answers + exam events + anticheat upload)
  -> end
"""
import random
import time
import uuid
import logging

import requests as raw_requests
from locust import HttpUser, task, between, events
from locust.exception import StopUser

from helpers.auth import login_student
from helpers import data as D

logger = logging.getLogger(__name__)

_student_counter = 0
_student_lock = __import__("threading").Lock()


def _next_student_index() -> int:
    global _student_counter
    with _student_lock:
        _student_counter += 1
        idx = _student_counter
        if idx > D.NUM_STUDENTS:
            _student_counter = 1
            idx = 1
    return idx


class PaperExamUser(HttpUser):
    """Paper exam scenario: no /submissions/ traffic."""

    wait_time = between(2, 5)
    weight = 10

    def on_start(self):
        self.student_idx = _next_student_index()
        self.email = D.student_email(self.student_idx)
        self.contest_id: int | None = None
        self.exam_questions: list[dict] = []
        self.upload_session_id: str = uuid.uuid4().hex
        self.next_seq: int = 1
        self.exam_started = False
        self._last_heartbeat_at: float = 0.0
        self._last_anticheat_upload_at: float = 0.0
        self._anticheat_url_pool: list[dict] = []
        self._last_refresh_at: float = 0.0

        result = login_student(self.client, self.email, D.STUDENT_PASSWORD)
        if not result:
            logger.error("Cannot start paper-exam user %s — login failed", self.email)
            raise StopUser()

        self._discover_contest()
        if not self.contest_id:
            logger.error("Contest '%s' not found", D.CONTEST_NAME)
            raise StopUser()

        self._enter_contest()
        self._start_exam()
        if self.exam_started:
            self._refresh_exam_context()

    def _discover_contest(self):
        if D.CONTEST_ID:
            self.contest_id = D.CONTEST_ID
            return

        resp = self.client.get(
            "/api/v1/contests/",
            params={"scope": "visible"},
            name="/api/v1/contests/",
        )
        if resp.status_code == 200:
            for c in resp.json().get("results", resp.json()):
                if c.get("name") == D.CONTEST_NAME:
                    D.CONTEST_ID = c["id"]
                    self.contest_id = c["id"]
                    break

    def _enter_contest(self):
        self.client.post(
            f"/api/v1/contests/{self.contest_id}/enter/",
            name="/api/v1/contests/[id]/enter/",
        )

    def _start_exam(self):
        resp = self.client.post(
            f"/api/v1/contests/{self.contest_id}/exam/start/",
            name="/api/v1/contests/[id]/exam/start/",
        )
        if resp.status_code in (200, 201):
            self.exam_started = True

    def _refresh_exam_context(self):
        self.client.get(
            f"/api/v1/contests/{self.contest_id}/",
            name="/api/v1/contests/[id]/",
        )
        resp = self.client.get(
            f"/api/v1/contests/{self.contest_id}/exam-questions/",
            name="/api/v1/contests/[id]/exam-questions/",
        )
        if resp.status_code == 200:
            result = resp.json()
            if isinstance(result, list):
                self.exam_questions = result
            else:
                self.exam_questions = result.get("results", [])

    @task(6)
    def autosave_answer(self):
        """Auto-save random answer to paper-exam questions."""
        if not self.exam_started or not self.exam_questions:
            return
        payload = D.random_exam_answer_payload(self.exam_questions)
        if payload:
            self.client.post(
                f"/api/v1/contests/{self.contest_id}/exam-answers/submit/",
                json=payload,
                name="/api/v1/contests/[id]/exam-answers/submit/",
            )

    @task(3)
    def heartbeat(self):
        """Benign exam events to simulate active page telemetry."""
        if not self.exam_started:
            return
        now = time.time()
        if now - self._last_heartbeat_at < D.HEARTBEAT_INTERVAL_SECONDS:
            return
        self._last_heartbeat_at = now

        event_type = random.choice(["mouse_leave", "capture_upload_degraded"])
        self.client.post(
            f"/api/v1/contests/{self.contest_id}/exam/events/",
            json={
                "event_type": event_type,
                "metadata": {
                    "upload_session_id": self.upload_session_id,
                    "phase": "RESPONDING",
                },
            },
            name="/api/v1/contests/[id]/exam/events/",
        )

    @task(2)
    def anticheat_upload(self):
        """Upload screenshot via presigned URLs (same as exam mode)."""
        if not self.exam_started:
            return
        now = time.time()
        if now - self._last_anticheat_upload_at < D.ANTICHEAT_UPLOAD_INTERVAL_SECONDS:
            return
        self._last_anticheat_upload_at = now

        if len(self._anticheat_url_pool) <= D.ANTICHEAT_URL_LOW_WATERMARK:
            batch_size = max(1, D.ANTICHEAT_URL_BATCH_SIZE)
            resp = self.client.get(
                f"/api/v1/contests/{self.contest_id}/exam/anticheat-urls/",
                params={
                    "count": batch_size,
                    "upload_session_id": self.upload_session_id,
                    "start_seq": self.next_seq,
                },
                name="/api/v1/contests/[id]/exam/anticheat-urls/",
            )
            if resp.status_code != 200:
                return
            payload = resp.json()
            self.next_seq = payload.get("next_seq", self.next_seq + batch_size)
            self._anticheat_url_pool.extend(payload.get("items", []))

        if not self._anticheat_url_pool:
            return
        item = self._anticheat_url_pool.pop(0)
        put_url = item.get("put_url", "")
        headers = item.get("required_headers", {})
        if not headers:
            headers = {"Content-Type": "image/webp", "x-amz-tagging": "cleanup=true"}

        try:
            start_ts = time.time()
            r = raw_requests.put(
                put_url,
                data=D.get_fake_frame(),
                headers=headers,
                timeout=10,
            )
            elapsed_ms = (time.time() - start_ts) * 1000
            events.request.fire(
                request_type="PUT",
                name="MinIO PUT screenshot",
                response_time=elapsed_ms,
                response_length=0,
                response=r,
                context={},
                exception=None if r.status_code in (200, 201) else Exception(f"MinIO PUT {r.status_code}"),
            )
        except Exception as e:
            events.request.fire(
                request_type="PUT",
                name="MinIO PUT screenshot",
                response_time=0,
                response_length=0,
                response=None,
                context={},
                exception=e,
            )

    @task(1)
    def refresh_contest_info(self):
        """Occasionally refresh contest/question context while answering."""
        if not self.exam_started:
            return
        now = time.time()
        if now - self._last_refresh_at < 20:
            return
        self._last_refresh_at = now
        self._refresh_exam_context()

    def on_stop(self):
        if self.exam_started and self.contest_id:
            self.client.post(
                f"/api/v1/contests/{self.contest_id}/exam/end/",
                json={
                    "submit_reason": "paper_exam_loadtest_complete",
                    "upload_session_id": self.upload_session_id,
                },
                name="/api/v1/contests/[id]/exam/end/",
            )
