from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

import httpx


class QJudgeApiClient:
    def __init__(
        self,
        *,
        base_url: str,
        access_token: str,
        http_client: httpx.Client | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.access_token = access_token
        self._client = http_client or httpx.Client(timeout=30.0)

    def close(self) -> None:
        self._client.close()

    def request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        headers = dict(kwargs.pop("headers", {}) or {})
        headers.setdefault("Authorization", f"Bearer {self.access_token}")
        headers.setdefault("Accept", "application/json")
        response = self._client.request(
            method,
            f"{self.base_url}{path}",
            headers=headers,
            **kwargs,
        )
        response.raise_for_status()
        return response

    def get_json(self, path: str, **kwargs: Any) -> Any:
        return self.request("GET", path, **kwargs).json()

    def post_json(self, path: str, payload: dict[str, Any] | None = None) -> Any:
        return self.request("POST", path, json=payload or {}).json()

    def patch_json(self, path: str, payload: dict[str, Any]) -> Any:
        return self.request("PATCH", path, json=payload).json()

    def list_classrooms(self, scope: str = "teaching") -> list[dict[str, Any]]:
        data = self.get_json(f"/api/v1/classrooms/?scope={scope}")
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and isinstance(data.get("results"), list):
            return data["results"]
        return []

    def list_classroom_exams(self, classroom_id: str) -> list[dict[str, Any]]:
        data = self.get_json(f"/api/v1/classrooms/{classroom_id}/contests/")
        return data if isinstance(data, list) else []

    def list_subjective_questions(self, contest_id: str) -> list[dict[str, Any]]:
        data = self.get_json(
            f"/api/v1/contests/{contest_id}/exam-questions/?kind=subjective"
        )
        return data if isinstance(data, list) else []

    def list_models(self) -> list[dict[str, Any]]:
        data = self.get_json("/api/v1/ai/models/")
        models = data.get("models") if isinstance(data, dict) else None
        return models if isinstance(models, list) else []

    def grading_answers(
        self,
        *,
        contest_id: str,
        question_id: str,
    ) -> list[dict[str, Any]]:
        data = self.get_json(
            "/api/v1/contests/"
            f"{contest_id}/exam-answers/all-answers/"
            f"?projection=grading&question_id={question_id}"
        )
        rows = data.get("data") if isinstance(data, dict) else data
        return rows if isinstance(rows, list) else []

    def create_ai_session(self) -> str:
        data = self.post_json("/api/v1/ai/sessions/new_session/")
        session_id = data.get("id") if isinstance(data, dict) else None
        if not isinstance(session_id, str) or not session_id:
            raise RuntimeError("Backend did not return an AI session id")
        return session_id

    def patch_ai_session_context(
        self,
        *,
        session_id: str,
        context: dict[str, Any],
    ) -> None:
        self.patch_json(f"/api/v1/ai/sessions/{session_id}/", {"context": context})

    def upload_artifact(
        self,
        *,
        session_id: str,
        path: Path,
        step: str,
        content_type: str,
    ) -> dict[str, Any]:
        with path.open("rb") as fh:
            response = self.request(
                "POST",
                "/api/v1/ai/artifacts/upload/",
                files={"file": (path.name, fh, content_type)},
                data={"session_id": session_id, "step": step},
                headers={"Accept": "application/json"},
            )
        return response.json()

    def start_ai_run(
        self,
        *,
        session_id: str,
        prompt: str,
        model_id: str,
    ) -> dict[str, Any]:
        return self.post_json(
            f"/api/v1/ai/sessions/{session_id}/runs/",
            {"content": prompt, "model_id": model_id},
        )

    def list_artifacts(self, *, session_id: str) -> list[dict[str, Any]]:
        data = self.get_json(f"/api/v1/ai/artifacts/?session_id={session_id}")
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and isinstance(data.get("results"), list):
            return data["results"]
        return []

    def artifact_content(self, artifact_id: str) -> str:
        return self.request(
            "GET",
            f"/api/v1/ai/artifacts/{artifact_id}/content/",
            headers={"Accept": "*/*"},
        ).text

    def iter_run_events(self, run_id: str) -> Iterable[dict[str, Any]]:
        with self._client.stream(
            "GET",
            f"{self.base_url}/api/v1/ai/runs/{run_id}/events/?after=0",
            headers={
                "Authorization": f"Bearer {self.access_token}",
                "X-QJudge-Agent-Contract": "v2",
            },
            timeout=httpx.Timeout(10.0, read=None),
        ) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                if not line.startswith("data: "):
                    continue
                raw = line[6:]
                if not raw:
                    continue
                yield json.loads(raw)
