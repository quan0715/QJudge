from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

import httpx
from django.conf import settings


class ControllerError(RuntimeError):
    pass


@dataclass(frozen=True)
class IntegrityControllerClient:
    base_url: str
    token_file: str
    timeout_seconds: float = 10.0

    def _post(self, path: str, payload: dict) -> dict:
        token = Path(self.token_file).read_text(encoding="utf-8").strip()
        if not token:
            raise ControllerError("controller credential is empty")
        response = httpx.post(
            self.base_url.rstrip("/") + path,
            json=payload,
            headers={"Authorization": "Bearer " + token},
            timeout=self.timeout_seconds,
        )
        if response.status_code >= 400:
            raise ControllerError(
                "controller request failed status=" + str(response.status_code)
            )
        result = response.json()
        if not isinstance(result, Mapping):
            raise ControllerError("controller returned a non-object response")
        return dict(result)

    def start(self, run_id, *, token: str, image: str) -> dict:
        return self._post(
            "/v1/runs/" + str(run_id) + "/start",
            {"run_token": token, "worker_image": image},
        )

    def stop_container(self, run_id) -> dict:
        return self._post("/v1/runs/" + str(run_id) + "/stop", {})

    def destroy(self, run_id) -> dict:
        return self._post("/v1/runs/" + str(run_id) + "/destroy", {})

    def purge_data(self, run_id) -> dict:
        return self._post("/v1/runs/" + str(run_id) + "/purge-data", {})


def build_integrity_controller_client() -> IntegrityControllerClient:
    return IntegrityControllerClient(
        base_url=settings.INTEGRITY_CONTROLLER_URL,
        token_file=settings.INTEGRITY_CONTROLLER_TOKEN_FILE,
    )
