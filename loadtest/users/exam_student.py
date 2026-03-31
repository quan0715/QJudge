"""
ExamStudentUser — simulates a full exam lifecycle for one student.

Flow:
  login → enter → start → (heartbeat + anticheat-urls + minio PUT + answers + submissions) → end
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

# Global counter for assigning student indices to Locust greenlets
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


class ExamStudentUser(HttpUser):
    """Full exam lifecycle user."""

    wait_time = between(2, 5)
    weight = 10  # primary scenario

    def on_start(self):
        self.student_idx = _next_student_index()
        self.email = D.student_email(self.student_idx)
        self.contest_id: int | None = None
        self.contest_problems: list[dict] = []
        self.exam_questions: list[dict] = []
        self.upload_session_id: str = uuid.uuid4().hex
        self.next_seq: int = 1
        self.exam_started = False
        self._last_heartbeat_at: float = 0.0
        self._last_anticheat_upload_at: float = 0.0
        self._anticheat_url_pool: list[dict] = []

        # Login
        result = login_student(self.client, self.email, D.STUDENT_PASSWORD)
        if not result:
            logger.error("Cannot start user %s — login failed", self.email)
            raise StopUser()

        # Discover contest ID
        self._discover_contest()
        if not self.contest_id:
            logger.error("Contest '%s' not found", D.CONTEST_NAME)
            return

        # Enter + start exam, then fetch details
        entered = self._enter_or_register_contest()
        if not entered:
            raise StopUser()
        self._start_exam()
        if self.exam_started:
            self._fetch_contest_details()

    # ---- Setup helpers ----

    def _discover_contest(self):
        if D.CONTEST_ID:
            self.contest_id = D.CONTEST_ID
            return

        resp = self.client.get(
            "/api/v1/contests/", params={"scope": "visible"},
            name="/api/v1/contests/",
        )
        if resp.status_code == 200:
            for c in resp.json().get("results", resp.json()):
                if c.get("name") == D.CONTEST_NAME:
                    D.CONTEST_ID = c["id"]
                    self.contest_id = c["id"]
                    break

    def _fetch_contest_details(self):
        resp = self.client.get(
            f"/api/v1/contests/{self.contest_id}/",
            name="/api/v1/contests/[id]/",
        )
        if resp.status_code == 200:
            detail = resp.json()
            self.contest_problems = detail.get("problems", [])

        # Fetch exam questions (only after exam started, otherwise 403)
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
        with self.client.post(
            f"/api/v1/contests/{self.contest_id}/register/",
            json={},
            name="/api/v1/contests/[id]/register/",
            catch_response=True,
        ) as resp:
            msg = self._extract_message(resp)
            if resp.status_code == 201 or "Already registered" in msg:
                resp.success()
                return True
            resp.failure(f"register failed: {resp.status_code} {msg}")
            return False

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
            if resp.status_code == 400 and "already finished this exam" in msg.lower():
                resp.success()
                self.exam_started = False
                return
            if resp.status_code == 409 and "active for this exam session" in msg.lower():
                resp.success()
                self.exam_started = False
                return
            resp.failure(f"start failed: {resp.status_code} {msg}")

    # ---- Exam tasks ----

    @task(10)
    def heartbeat(self):
        """Send a benign event periodically (simulates anticheat telemetry)."""
        if not self.exam_started:
            return
        now = time.time()
        if now - self._last_heartbeat_at < D.HEARTBEAT_INTERVAL_SECONDS:
            return
        self._last_heartbeat_at = now
        # Use valid event types that won't penalize/lock the student
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

    @task(10)
    def anticheat_upload(self):
        """Upload fake screenshot to MinIO with presigned-URL pooling."""
        if not self.exam_started:
            return

        now = time.time()
        if now - self._last_anticheat_upload_at < D.ANTICHEAT_UPLOAD_INTERVAL_SECONDS:
            return
        self._last_anticheat_upload_at = now

        # Refill presigned URL pool only when low, to avoid excessive backend churn.
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

            # Report to Locust stats
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

    @task(3)
    def save_exam_answer(self):
        """Submit/save an answer to a random exam question."""
        if not self.exam_started or not self.exam_questions:
            return
        payload = D.random_exam_answer_payload(self.exam_questions)
        if payload:
            self.client.post(
                f"/api/v1/contests/{self.contest_id}/exam-answers/submit/",
                json=payload,
                name="/api/v1/contests/[id]/exam-answers/submit/",
            )

    @task(1)
    def submit_code(self):
        """Submit code for a random coding problem."""
        if not self.exam_started or not self.contest_problems:
            return
        payload = D.random_submission_payload(self.contest_problems)
        if payload:
            self.client.post(
                "/api/v1/submissions/",
                json=payload,
                name="/api/v1/submissions/",
            )

    @task(1)
    def view_standings(self):
        """View scoreboard."""
        if not self.contest_id:
            return
        self.client.get(
            f"/api/v1/contests/{self.contest_id}/standings/",
            name="/api/v1/contests/[id]/standings/",
        )

    def on_stop(self):
        """End exam on user stop."""
        if self.exam_started and self.contest_id:
            self.client.post(
                f"/api/v1/contests/{self.contest_id}/exam/end/",
                json={
                    "submit_reason": "loadtest_complete",
                    "upload_session_id": self.upload_session_id,
                },
                name="/api/v1/contests/[id]/exam/end/",
            )
