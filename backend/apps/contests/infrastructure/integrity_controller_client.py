from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

import httpx
from django.conf import settings


_SHA256_RE = re.compile(r"[0-9a-fA-F]{64}\Z")
_STATUS_STATES = frozenset({"created", "running", "stopping", "stopped", "exited"})
_SAFE_ERROR_CODES = frozenset(
    {
        "controller_credential_unavailable",
        "controller_transport_failed",
        "controller_http_failed",
        "controller_response_invalid",
    }
)


class ControllerError(RuntimeError):
    def __init__(self, code: str = "controller_transport_failed") -> None:
        safe_code = code if code in _SAFE_ERROR_CODES else "controller_transport_failed"
        super().__init__(safe_code)
        self.code = safe_code


@dataclass(frozen=True)
class ControllerRunStatus:
    """Task 7's narrow, secret-free reconciliation response contract."""

    run_id: str
    exists: bool
    state: str
    container_id: str = ""
    container_name: str = ""
    worker_url: str = ""
    image_digest: str = ""
    run_token_sha256: str = ""


def _required_string(
    payload: Mapping[str, object],
    key: str,
    *,
    max_length: int,
) -> str:
    value = payload.get(key)
    if (
        not isinstance(value, str)
        or not value
        or value != value.strip()
        or len(value) > max_length
    ):
        raise ControllerError("controller_response_invalid") from None
    return value


@dataclass(frozen=True)
class IntegrityControllerClient:
    base_url: str
    token_file: str
    connect_timeout_seconds: float = 5.0
    start_read_timeout_seconds: float = 300.0
    stop_read_timeout_seconds: float = 40.0
    status_read_timeout_seconds: float = 10.0
    default_read_timeout_seconds: float = 30.0
    write_timeout_seconds: float = 10.0
    pool_timeout_seconds: float = 5.0

    def _timeout(self, read_timeout_seconds: float) -> httpx.Timeout:
        return httpx.Timeout(
            connect=self.connect_timeout_seconds,
            read=read_timeout_seconds,
            write=self.write_timeout_seconds,
            pool=self.pool_timeout_seconds,
        )

    def _request(
        self,
        method: str,
        path: str,
        *,
        payload: dict | None,
        read_timeout_seconds: float,
    ) -> dict:
        try:
            token = Path(self.token_file).read_text(encoding="utf-8").strip()
        except Exception:
            raise ControllerError("controller_credential_unavailable") from None
        if not token:
            raise ControllerError("controller_credential_unavailable") from None

        request_kwargs = {
            "headers": {"Authorization": "Bearer " + token},
            "timeout": self._timeout(read_timeout_seconds),
        }
        if payload is not None:
            request_kwargs["json"] = payload
        try:
            response = httpx.request(
                method,
                self.base_url.rstrip("/") + path,
                **request_kwargs,
            )
        except Exception:
            raise ControllerError("controller_transport_failed") from None
        if response.status_code >= 400:
            raise ControllerError("controller_http_failed") from None
        try:
            result = response.json()
        except Exception:
            raise ControllerError("controller_response_invalid") from None
        if not isinstance(result, Mapping):
            raise ControllerError("controller_response_invalid") from None
        return dict(result)

    def start(self, run_id, *, token: str, image: str) -> dict:
        return self._request(
            "POST",
            "/v1/runs/" + str(run_id) + "/start",
            payload={"run_token": token, "worker_image": image},
            read_timeout_seconds=self.start_read_timeout_seconds,
        )

    def status(self, run_id) -> ControllerRunStatus:
        expected_run_id = str(run_id)
        result = self._request(
            "GET",
            "/v1/runs/" + expected_run_id + "/status",
            payload=None,
            read_timeout_seconds=self.status_read_timeout_seconds,
        )
        response_run_id = _required_string(result, "run_id", max_length=64)
        exists = result.get("exists")
        state = result.get("state")
        if response_run_id != expected_run_id or not isinstance(exists, bool):
            raise ControllerError("controller_response_invalid") from None
        if exists is False:
            if state != "absent":
                raise ControllerError("controller_response_invalid") from None
            return ControllerRunStatus(
                run_id=response_run_id,
                exists=False,
                state="absent",
            )
        if state not in _STATUS_STATES:
            raise ControllerError("controller_response_invalid") from None

        container_id = _required_string(result, "container_id", max_length=128)
        container_name = _required_string(result, "container_name", max_length=128)
        worker_url = _required_string(result, "worker_url", max_length=512)
        image_digest = _required_string(result, "image_digest", max_length=255)
        run_token_sha256 = _required_string(
            result,
            "run_token_sha256",
            max_length=64,
        )
        if not _SHA256_RE.fullmatch(run_token_sha256):
            raise ControllerError("controller_response_invalid") from None
        return ControllerRunStatus(
            run_id=response_run_id,
            exists=True,
            state=state,
            container_id=container_id,
            container_name=container_name,
            worker_url=worker_url,
            image_digest=image_digest,
            run_token_sha256=run_token_sha256.lower(),
        )

    def restart(self, run_id) -> dict:
        return self._request(
            "POST",
            "/v1/runs/" + str(run_id) + "/restart",
            payload={},
            read_timeout_seconds=self.stop_read_timeout_seconds,
        )

    def stop_container(self, run_id) -> dict:
        return self._request(
            "POST",
            "/v1/runs/" + str(run_id) + "/stop",
            payload={},
            read_timeout_seconds=self.stop_read_timeout_seconds,
        )

    def destroy(self, run_id) -> dict:
        return self._request(
            "POST",
            "/v1/runs/" + str(run_id) + "/destroy",
            payload={},
            read_timeout_seconds=self.default_read_timeout_seconds,
        )

    def purge_data(self, run_id) -> dict:
        return self._request(
            "POST",
            "/v1/runs/" + str(run_id) + "/purge-data",
            payload={},
            read_timeout_seconds=self.default_read_timeout_seconds,
        )


def build_integrity_controller_client() -> IntegrityControllerClient:
    return IntegrityControllerClient(
        base_url=settings.INTEGRITY_CONTROLLER_URL,
        token_file=settings.INTEGRITY_CONTROLLER_TOKEN_FILE,
    )
