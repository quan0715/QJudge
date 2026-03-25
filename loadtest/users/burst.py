"""
Burst test users — all users hit a single endpoint simultaneously.
Run with: locust -f locustfile.py --tags burst-start (or burst-submit, burst-end)
"""
import uuid
import logging
import random

from locust import HttpUser, task, between, tag
from locust.exception import StopUser

from helpers.auth import login_student
from helpers import data as D

logger = logging.getLogger(__name__)

# Burst users use the upper half of the student pool (101-200)
# to avoid colliding with ExamStudentUser (1-100)
_burst_counter = 100
_burst_lock = __import__("threading").Lock()


def _next_burst_index() -> int:
    global _burst_counter
    with _burst_lock:
        _burst_counter += 1
        idx = _burst_counter
        if idx > D.NUM_STUDENTS:
            _burst_counter = 101
            idx = 101
    return idx


class _BurstBase(HttpUser):
    abstract = True
    wait_time = between(0, 0.5)

    def on_start(self):
        idx = _next_burst_index()
        self.email = D.student_email(idx)
        self.contest_id: int | None = None
        self.upload_session_id = uuid.uuid4().hex

        result = login_student(self.client, self.email, D.STUDENT_PASSWORD)
        if not result:
            raise StopUser()

        # Discover contest
        if D.CONTEST_ID:
            self.contest_id = D.CONTEST_ID
        else:
            resp = self.client.get("/api/v1/contests/", params={"scope": "visible"},
                                   name="/api/v1/contests/")
            if resp.status_code == 200:
                for c in resp.json().get("results", resp.json()):
                    if c.get("name") == D.CONTEST_NAME:
                        D.CONTEST_ID = c["id"]
                        self.contest_id = c["id"]
                        break


class BurstStartUser(_BurstBase):
    """200 users hit /exam/start/ simultaneously."""

    @tag("burst-start")
    @task
    def burst_start(self):
        if not self.contest_id:
            raise StopUser()
        self.client.post(
            f"/api/v1/contests/{self.contest_id}/enter/",
            name="/api/v1/contests/[id]/enter/",
        )
        self.client.post(
            f"/api/v1/contests/{self.contest_id}/exam/start/",
            name="/api/v1/contests/[id]/exam/start/ [BURST]",
        )
        raise StopUser()


class BurstSubmitUser(_BurstBase):
    """200 users hit /submissions/ simultaneously."""

    @tag("burst-submit")
    @task
    def burst_submit(self):
        if not self.contest_id:
            raise StopUser()
        # Coding contest path: enter contest only (no exam/start required).
        with self.client.post(
            f"/api/v1/contests/{self.contest_id}/enter/",
            name="/api/v1/contests/[id]/enter/",
            catch_response=True,
        ) as enter_resp:
            if enter_resp.status_code not in (200, 201):
                enter_resp.failure(f"enter failed: {enter_resp.status_code}")
                raise StopUser()
            enter_resp.success()

        # Use seeded problem ids directly to avoid extra fetch bottlenecks.
        payload = {
            "problem": random.choice([1, 2, 3]),
            "contest": self.contest_id,
            "code": D.CPP_SOLUTIONS["A+B Problem"],
            "language": "cpp",
            "source_type": "contest",
        }
        with self.client.post(
            "/api/v1/submissions/",
            json=payload,
            name="/api/v1/submissions/ [BURST]",
            catch_response=True,
        ) as submit_resp:
            if submit_resp.status_code in (200, 201, 202):
                submit_resp.success()
            else:
                submit_resp.failure(
                    f"submit failed: {submit_resp.status_code} {(submit_resp.text or '')[:120]}"
                )
        raise StopUser()


class BurstEndUser(_BurstBase):
    """200 users hit /exam/end/ simultaneously."""

    @tag("burst-end")
    @task
    def burst_end(self):
        if not self.contest_id:
            raise StopUser()
        self.client.post(f"/api/v1/contests/{self.contest_id}/enter/",
                         name="/api/v1/contests/[id]/enter/")
        self.client.post(f"/api/v1/contests/{self.contest_id}/exam/start/",
                         name="/api/v1/contests/[id]/exam/start/")
        self.client.post(
            f"/api/v1/contests/{self.contest_id}/exam/end/",
            json={
                "submit_reason": "burst_test",
                "upload_session_id": self.upload_session_id,
            },
            name="/api/v1/contests/[id]/exam/end/ [BURST]",
        )
        raise StopUser()
