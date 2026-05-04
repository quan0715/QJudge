from __future__ import annotations

import csv
import os
import random
import time
import uuid
from itertools import cycle
from pathlib import Path
from threading import Lock
from typing import Any

from locust import HttpUser, between, events, task
from locust.exception import StopUser


RUN_ID = os.getenv("LOADTEST_RUN_ID", "").strip()
CONTEST_ID = os.getenv("LOADTEST_CONTEST_ID", "").strip()
USERS_CSV = os.getenv("LOADTEST_USERS_CSV", "loadtests/anticheat_exam/users.example.csv")
FRAME_COUNT = int(os.getenv("LOADTEST_FRAME_COUNT", "7"))
PRE_LOSS_FRAME_COUNT = int(os.getenv("LOADTEST_PRE_LOSS_FRAME_COUNT", "6"))
THINK_MIN = float(os.getenv("LOADTEST_THINK_MIN_SECONDS", "3"))
THINK_MAX = float(os.getenv("LOADTEST_THINK_MAX_SECONDS", "12"))
REQUEST_TIMEOUT = float(os.getenv("LOADTEST_REQUEST_TIMEOUT_SECONDS", "10"))
HEARTBEAT_INTERVAL = float(os.getenv("LOADTEST_HEARTBEAT_INTERVAL_SECONDS", "15"))
ENABLE_SUBMIT = os.getenv("LOADTEST_ENABLE_SUBMIT", "false").lower() == "true"
ENABLE_ADMIN = os.getenv("LOADTEST_ENABLE_ADMIN", "false").lower() == "true"
CALL_CONTEST_ENTER = os.getenv("LOADTEST_CALL_CONTEST_ENTER", "false").lower() == "true"
ENABLE_MOUSE_LEAVE = os.getenv("LOADTEST_ENABLE_MOUSE_LEAVE", "true").lower() == "true"
ENABLE_STREAM_LOSS = os.getenv("LOADTEST_ENABLE_STREAM_LOSS", "false").lower() == "true"
FORCE_EVIDENCE_ON_START = os.getenv("LOADTEST_FORCE_EVIDENCE_ON_START", "false").lower() == "true"
ADMIN_EMAIL = os.getenv("LOADTEST_ADMIN_EMAIL", "").strip()
ADMIN_PASSWORD = os.getenv("LOADTEST_ADMIN_PASSWORD", "").strip()
ADMIN_USERS = 1 if ENABLE_ADMIN and ADMIN_EMAIL and ADMIN_PASSWORD else 0

# Small RIFF/WebP-like payload. The current backend validates object presence,
# Content-Type, and size via storage HEAD; it does not decode image bytes.
WEBP_BYTES = (
    b"RIFF"
    + (64).to_bytes(4, "little")
    + b"WEBPVP8 "
    + b"\x34\x00\x00\x00"
    + b"LOADTEST_ANTICHEAT_EVIDENCE_FRAME"
    + b"\x00" * 20
)


class AccountPool:
    def __init__(self, csv_path: str):
        self._lock = Lock()
        self._accounts = self._load(csv_path)
        self._cycle = cycle(self._accounts)

    @staticmethod
    def _load(csv_path: str) -> list[dict[str, str]]:
        path = Path(csv_path)
        if not path.exists():
            raise RuntimeError(f"users CSV not found: {path}")
        with path.open(newline="", encoding="utf-8") as fp:
            rows = list(csv.DictReader(fp))
        accounts = []
        for row in rows:
            email = (row.get("email") or "").strip()
            username = (row.get("username") or "").strip()
            password = (row.get("password") or "").strip()
            if not password or not (email or username):
                continue
            accounts.append({"email": email, "username": username, "password": password})
        if not accounts:
            raise RuntimeError(f"users CSV has no usable accounts: {path}")
        return accounts

    def next(self) -> dict[str, str]:
        with self._lock:
            return next(self._cycle)


account_pool: AccountPool | None = None


@events.init.add_listener
def _init_environment(environment, **_kwargs):
    if not RUN_ID:
        raise RuntimeError("LOADTEST_RUN_ID is required")
    if not CONTEST_ID:
        raise RuntimeError("LOADTEST_CONTEST_ID is required")
    global account_pool
    account_pool = AccountPool(USERS_CSV)
    abort_on_5xx = os.getenv("LOADTEST_ABORT_ON_5XX", "true").lower() == "true"

    def abort_on_server_error(request_type, name, response_time, response_length, response, context, exception, **_kwargs):
        if not abort_on_5xx or exception is not None:
            return
        status_code = getattr(response, "status_code", 0)
        if status_code >= 500 and environment.runner is not None:
            environment.runner.quit()

    environment.events.request.add_listener(abort_on_server_error)


def now_ms() -> int:
    return int(time.time() * 1000)


def auth_headers(token: str, device_id: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "X-Device-Id": device_id,
        "Content-Type": "application/json",
        "Connection": "close",
    }


def base_headers() -> dict[str, str]:
    return {"Connection": "close"}


def json_or_empty(response) -> dict[str, Any]:
    try:
        data = response.json()
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def close_response(response) -> None:
    close = getattr(response, "close", None)
    if callable(close):
        close()


def short_upload_session_id(event_type: str) -> str:
    safe_run_id = "".join(ch for ch in RUN_ID if ch.isalnum())[-20:] or "run"
    safe_event_type = "".join(ch for ch in event_type if ch.isalnum())[:12] or "event"
    return f"lt_{safe_run_id}_{safe_event_type}_{uuid.uuid4().hex[:8]}"


class ExamStudentUser(HttpUser):
    wait_time = between(THINK_MIN, THINK_MAX)
    weight = 100

    def on_start(self):
        if account_pool is None:
            raise RuntimeError("account pool is not initialized")
        self.account = account_pool.next()
        self.username = self.account.get("username") or self.account.get("email") or uuid.uuid4().hex
        self.device_id = f"loadtest-{RUN_ID}-{self.username}"
        self.token = ""
        self.question_ids: list[str] = []
        self._next_heartbeat_at = 0.0
        self.login()
        self.enter_and_start_exam()
        self.record_exam_event("exam_entered", evidence_mode="audit")
        self.send_heartbeat()
        self.load_questions()
        if FORCE_EVIDENCE_ON_START and ENABLE_MOUSE_LEAVE:
            self.mouse_leave_with_evidence()

    def login(self):
        payload = {
            "email": self.account.get("email") or self.account.get("username"),
            "password": self.account["password"],
        }
        with self.client.post(
            "/api/v1/auth/email/login",
            json=payload,
            headers=base_headers(),
            timeout=REQUEST_TIMEOUT,
            name="auth login",
            catch_response=True,
        ) as response:
            try:
                data = json_or_empty(response).get("data") or {}
                token = data.get("access_token")
                if response.status_code != 200 or not token:
                    response.failure(f"login failed status={response.status_code}")
                    return
                self.token = str(token)
            finally:
                close_response(response)

    def enter_and_start_exam(self):
        headers = auth_headers(self.token, self.device_id)
        response = self.client.get(
            f"/api/v1/contests/{CONTEST_ID}/",
            headers=headers,
            timeout=REQUEST_TIMEOUT,
            name="contest detail",
        )
        close_response(response)
        if CALL_CONTEST_ENTER:
            response = self.client.post(
                f"/api/v1/contests/{CONTEST_ID}/enter/",
                headers=headers,
                json={},
                timeout=REQUEST_TIMEOUT,
                name="contest enter",
            )
            close_response(response)
        response = self.client.post(
            f"/api/v1/contests/{CONTEST_ID}/exam/start/",
            headers=headers,
            json={},
            timeout=REQUEST_TIMEOUT,
            name="exam start",
        )
        close_response(response)

    def load_questions(self):
        response = self.client.get(
            f"/api/v1/contests/{CONTEST_ID}/exam-questions/",
            headers=auth_headers(self.token, self.device_id),
            timeout=REQUEST_TIMEOUT,
            name="exam questions list",
        )
        try:
            data = response.json() if response.status_code == 200 else []
        finally:
            close_response(response)
        if isinstance(data, dict):
            data = data.get("results") or data.get("data") or []
        self.question_ids = [str(item.get("id")) for item in data if isinstance(item, dict) and item.get("id")]

    def record_exam_event(self, event_type: str, *, evidence_mode: str = "anchor_window") -> dict[str, Any]:
        anchor_ms = now_ms()
        payload = {
            "event_type": event_type,
            "metadata": {
                "loadtest": True,
                "loadtest_run_id": RUN_ID,
                "source": "locust:anticheat_exam",
                "device_id": self.device_id,
                "client_observed_at_ms": anchor_ms,
                "evidence_anchor_at_ms": anchor_ms,
                "evidence_mode": evidence_mode,
                "event_idempotency_key": f"{RUN_ID}:{self.username}:{event_type}:{uuid.uuid4().hex}",
                "module": "screen_share",
                "primary_source_module": "screen_share",
            },
        }
        if evidence_mode == "pre_loss":
            payload["metadata"]["loss_detected_at_ms"] = anchor_ms
        response = self.client.post(
            f"/api/v1/contests/{CONTEST_ID}/exam/events/",
            headers=auth_headers(self.token, self.device_id),
            json=payload,
            timeout=REQUEST_TIMEOUT,
            name=f"exam event {event_type}",
        )
        try:
            return json_or_empty(response) if response.status_code == 200 else {}
        finally:
            close_response(response)

    def upload_evidence_for_event(self, event: dict[str, Any], event_type: str, *, evidence_mode: str):
        event_id = event.get("event_id")
        cluster_id = event.get("evidence_cluster_id")
        anchor_ms = int(event.get("evidence_anchor_at_ms") or now_ms())
        if not event_id:
            return

        count = PRE_LOSS_FRAME_COUNT if evidence_mode == "pre_loss" else FRAME_COUNT
        if evidence_mode == "pre_loss":
            captured = [anchor_ms - ((count - seq) * 1000) for seq in range(1, count + 1)]
        else:
            start = anchor_ms - 3000
            captured = [start + ((seq - 1) * 1000) for seq in range(1, count + 1)]

        upload_session_id = short_upload_session_id(event_type)
        intent_payload = {
            "event_id": event_id,
            "evidence_cluster_id": cluster_id,
            "source_module": "screen_share",
            "evidence_mode": evidence_mode,
            "upload_session_id": upload_session_id,
            "frames": [
                {"client_captured_at_ms": ts_ms, "seq": seq}
                for seq, ts_ms in enumerate(captured, start=1)
            ],
        }
        with self.client.post(
            f"/api/v1/contests/{CONTEST_ID}/exam/evidence/upload-intents/",
            headers=auth_headers(self.token, self.device_id),
            json=intent_payload,
            timeout=REQUEST_TIMEOUT,
            name="evidence upload intents",
            catch_response=True,
        ) as intent_response:
            try:
                if intent_response.status_code not in (200, 201):
                    intent_response.failure(
                        f"upload intent failed status={intent_response.status_code} body={intent_response.text[:500]}"
                    )
                    return
                items = json_or_empty(intent_response).get("items") or []
            finally:
                close_response(intent_response)

        confirm_frames = []
        for item in items:
            put_url = item.get("put_url")
            if not put_url:
                continue
            headers = dict(item.get("required_headers") or {})
            headers.setdefault("Content-Type", "image/webp")
            put_response = self.client.put(
                put_url,
                data=WEBP_BYTES,
                headers=headers,
                timeout=REQUEST_TIMEOUT,
                name="storage PUT evidence frame",
            )
            try:
                if 200 <= put_response.status_code < 300:
                    confirm_frames.append(
                        {
                            "evidence_frame_id": item["evidence_frame_id"],
                            "object_key": item["object_key"],
                            "byte_size": len(WEBP_BYTES),
                        }
                    )
            finally:
                close_response(put_response)

        if confirm_frames:
            response = self.client.post(
                f"/api/v1/contests/{CONTEST_ID}/exam/evidence/upload-confirm/",
                headers=auth_headers(self.token, self.device_id),
                json={
                    "event_id": event_id,
                    "upload_session_id": upload_session_id,
                    "frames": confirm_frames,
                },
                timeout=REQUEST_TIMEOUT,
                name="evidence upload confirm",
            )
            close_response(response)

    @task(8)
    def heartbeat(self):
        self.send_heartbeat()

    def send_heartbeat(self):
        self.record_exam_event("heartbeat", evidence_mode="audit")
        self._next_heartbeat_at = time.monotonic() + HEARTBEAT_INTERVAL

    def maybe_send_heartbeat(self):
        if time.monotonic() >= self._next_heartbeat_at:
            self.send_heartbeat()

    @task(4)
    def autosave_answer(self):
        self.maybe_send_heartbeat()
        if not self.question_ids:
            self.load_questions()
        if not self.question_ids:
            return
        question_id = random.choice(self.question_ids)
        payload = {
            "question_id": question_id,
            "answer": {
                "selected": random.choice(["A", "B", "C", "D"]),
                "loadtest_run_id": RUN_ID,
            },
        }
        with self.client.post(
            f"/api/v1/contests/{CONTEST_ID}/exam-answers/submit/",
            headers=auth_headers(self.token, self.device_id),
            json=payload,
            timeout=REQUEST_TIMEOUT,
            name="exam answer autosave",
            catch_response=True,
        ) as response:
            try:
                if response.status_code not in (200, 201):
                    response.failure(f"answer autosave failed status={response.status_code} body={response.text[:300]}")
            finally:
                close_response(response)

    @task(2)
    def normal_navigation(self):
        self.maybe_send_heartbeat()
        response = self.client.get(
            f"/api/v1/contests/{CONTEST_ID}/exam-answers/my-answers/",
            headers=auth_headers(self.token, self.device_id),
            timeout=REQUEST_TIMEOUT,
            name="exam my answers",
        )
        close_response(response)

    @task(1)
    def mouse_leave_with_evidence(self):
        self.maybe_send_heartbeat()
        if not ENABLE_MOUSE_LEAVE:
            return
        event = self.record_exam_event("mouse_leave", evidence_mode="anchor_window")
        self.upload_evidence_for_event(event, "mouse_leave", evidence_mode="anchor_window")

    @task(1)
    def screen_share_stopped_with_pre_loss_evidence(self):
        self.maybe_send_heartbeat()
        if not ENABLE_STREAM_LOSS:
            return
        event = self.record_exam_event("screen_share_stopped", evidence_mode="pre_loss")
        self.upload_evidence_for_event(event, "screen_share_stopped", evidence_mode="pre_loss")

    def on_stop(self):
        if ENABLE_SUBMIT and self.token:
            response = self.client.post(
                f"/api/v1/contests/{CONTEST_ID}/exam/end/",
                headers=auth_headers(self.token, self.device_id),
                json={
                    "submit_reason": "loadtest_completed",
                    "source_module": "screen_share",
                },
                timeout=REQUEST_TIMEOUT,
                name="exam submit",
            )
            close_response(response)


class AdminReviewerUser(HttpUser):
    wait_time = between(5, 15)
    weight = ADMIN_USERS
    fixed_count = ADMIN_USERS

    def on_start(self):
        self.device_id = f"loadtest-{RUN_ID}-admin"
        self.token = ""
        if not ADMIN_USERS:
            raise StopUser()
        with self.client.post(
            "/api/v1/auth/email/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            headers=base_headers(),
            timeout=REQUEST_TIMEOUT,
            name="admin auth login",
            catch_response=True,
        ) as response:
            try:
                data = json_or_empty(response).get("data") or {}
                token = data.get("access_token")
                if response.status_code != 200 or not token:
                    response.failure(f"admin login failed status={response.status_code}")
                    return
                self.token = str(token)
            finally:
                close_response(response)

    @task(5)
    def incident_list(self):
        response = self.client.get(
            f"/api/v1/contests/{CONTEST_ID}/exam/events/",
            headers=auth_headers(self.token, self.device_id),
            timeout=REQUEST_TIMEOUT,
            name="admin exam events list",
        )
        close_response(response)

    @task(2)
    def dashboard_summary(self):
        response = self.client.get(
            f"/api/v1/contests/{CONTEST_ID}/exam-answers/dashboard-summary/",
            headers=auth_headers(self.token, self.device_id),
            timeout=REQUEST_TIMEOUT,
            name="admin dashboard summary",
        )
        close_response(response)

    @task(1)
    def screenshots_manifest_lookup(self):
        response = self.client.get(
            f"/api/v1/contests/{CONTEST_ID}/exam/screenshots/?evidence_cluster_id=missing-{uuid.uuid4().hex[:8]}",
            headers=auth_headers(self.token, self.device_id),
            timeout=REQUEST_TIMEOUT,
            name="admin screenshots manifest lookup",
        )
        close_response(response)
