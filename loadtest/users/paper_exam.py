"""
PaperExamUser — simulates paper-exam lifecycle without coding submissions.

Flow:
  login -> fetch contests -> enter -> start
  -> (fetch contest details + exam questions + auto-save answers + exam events)
  -> end
"""
import random
import time
import uuid
import logging
import os

from locust import HttpUser, task, between
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
    contest_password = os.getenv("LT_CONTEST_PASSWORD", "")

    def on_start(self):
        self.student_idx = _next_student_index()
        self.email = D.student_email(self.student_idx)
        self.contest_id: int | None = None
        self.exam_questions: list[dict] = []
        self.upload_session_id: str = uuid.uuid4().hex
        self.exam_started = False
        self._last_heartbeat_at: float = 0.0
        self._last_refresh_at: float = 0.0

        result = login_student(self.client, self.email, D.STUDENT_PASSWORD)
        if not result:
            logger.error("Cannot start paper-exam user %s — login failed", self.email)
            raise StopUser()

        self._discover_contest()
        if not self.contest_id:
            logger.error("Contest '%s' not found", D.CONTEST_NAME)
            raise StopUser()

        entered = self._enter_or_register_contest()
        if not entered:
            logger.error("Cannot start paper-exam user %s — contest enter failed", self.email)
            raise StopUser()
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

    @staticmethod
    def _extract_message(resp) -> str:
        try:
            payload = resp.json()
        except Exception:
            return (resp.text or "").strip()
        if isinstance(payload, dict):
            return str(payload.get("message") or payload.get("error") or "").strip()
        return str(payload).strip()

    def _register_contest(self) -> bool:
        payload = {}
        if self.contest_password:
            payload["password"] = self.contest_password
        resp = self.client.post(
            f"/api/v1/contests/{self.contest_id}/register/",
            json=payload,
            name="/api/v1/contests/[id]/register/",
        )
        msg = self._extract_message(resp)
        # Already registered is fine for idempotent setup.
        return resp.status_code == 201 or "Already registered" in msg

    def _enter_or_register_contest(self) -> bool:
        need_register = False
        with self.client.post(
            f"/api/v1/contests/{self.contest_id}/enter/",
            name="/api/v1/contests/[id]/enter/",
            catch_response=True,
        ) as resp:
            msg = self._extract_message(resp)
            if resp.status_code == 200:
                resp.success()
                return True
            if resp.status_code == 403 and "Not registered" in msg:
                resp.success()
                need_register = True
            elif resp.status_code == 403 and "left the contest and re-entry is not allowed" in msg:
                # Keep this request out of failure metrics; start endpoint is the real gate.
                resp.success()
                return True
            else:
                resp.failure(f"enter failed: {resp.status_code} {msg}")
                return False

        if not need_register:
            return True

        if not self._register_contest():
            return False

        with self.client.post(
            f"/api/v1/contests/{self.contest_id}/enter/",
            name="/api/v1/contests/[id]/enter/",
            catch_response=True,
        ) as retry:
            msg = self._extract_message(retry)
            if retry.status_code == 200:
                retry.success()
                return True
            retry.failure(f"enter retry failed: {retry.status_code} {msg}")
            return False

    def _start_exam(self):
        with self.client.post(
            f"/api/v1/contests/{self.contest_id}/exam/start/",
            name="/api/v1/contests/[id]/exam/start/",
            catch_response=True,
        ) as resp:
            msg = self._extract_message(resp)
            if resp.status_code in (200, 201):
                self.exam_started = True
                resp.success()
                return

            # Repeated test runs may hit previously-submitted participants.
            # Treat as skipped user instead of polluting failure rate.
            if resp.status_code == 400 and "already finished this exam" in msg.lower():
                resp.success()
                self.exam_started = False
                return
            if resp.status_code == 409 and "active for this exam session" in msg.lower():
                resp.success()
                self.exam_started = False
                return

            resp.failure(f"start failed: {resp.status_code} {msg}")

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
