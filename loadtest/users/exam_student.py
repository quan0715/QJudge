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
        self._enter_contest()
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

    # ---- Exam tasks ----

    @task(10)
    def heartbeat(self):
        """Send a benign event periodically (simulates anticheat telemetry)."""
        if not self.exam_started:
            return
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
        """Fetch presigned URLs and PUT a fake screenshot to MinIO."""
        if not self.exam_started:
            return

        # 1. Get presigned URLs
        resp = self.client.get(
            f"/api/v1/contests/{self.contest_id}/exam/anticheat-urls/",
            params={
                "count": 10,
                "upload_session_id": self.upload_session_id,
                "start_seq": self.next_seq,
            },
            name="/api/v1/contests/[id]/exam/anticheat-urls/",
        )
        if resp.status_code != 200:
            return

        payload = resp.json()
        self.next_seq = payload.get("next_seq", self.next_seq + 10)
        items = payload.get("items", [])

        # 2. PUT fake frame to MinIO for first item (simulate ~3s interval)
        if items:
            item = items[0]
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
