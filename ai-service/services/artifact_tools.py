"""Local LangChain tools for AI artifact read/write/list.

These tools are NOT loaded via MCP — they are session-private and bound
to the current run context. We build a small factory that closes over
``session_id`` / ``run_id`` / backend auth and returns three StructuredTools
ready to register alongside the MCP tools.

Backend API contract (see backend/apps/ai/artifact_views.py):
* ``POST   /api/v1/ai/_internal/artifacts/``   → create / upsert
* ``GET    /api/v1/ai/_internal/artifacts/``   → list (session_id required)
* ``GET    /api/v1/ai/_internal/artifacts/<id>/content/`` → raw bytes
"""
from __future__ import annotations

import csv
import io
import json
import logging
from typing import Any

import httpx
from langchain_core.tools import BaseTool, StructuredTool

logger = logging.getLogger(__name__)


_ARTIFACT_INTERNAL_PATH = "/api/v1/ai/_internal/artifacts/"


class ArtifactToolError(Exception):
    """Raised when an artifact tool call fails unrecoverably."""


def _headers(token: str) -> dict[str, str]:
    if not token:
        raise ArtifactToolError("AI internal token not configured")
    return {"X-AI-Internal-Token": token}


def _truncate(text: str, limit: int = 200_000) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n...[truncated, total {len(text)} chars]"


def build_artifact_tools(
    *,
    session_id: str | None,
    run_id: str | None,
    backend_base_url: str,
    internal_token: str,
    http_timeout_seconds: float = 10.0,
) -> list[BaseTool]:
    """Build the three artifact tools scoped to the current run.

    If ``session_id`` is missing, the tools return an error payload on call
    rather than raising — the agent sees a clean "session unknown" message.
    """

    base = backend_base_url.rstrip("/")
    internal_url = f"{base}{_ARTIFACT_INTERNAL_PATH}"

    def _require_session() -> str | None:
        if not session_id:
            return "session_id unavailable in current context; cannot use artifact tool"
        return None

    async def _artifact_write(
        step: str,
        filename: str,
        content: str,
        content_type: str = "text/plain; charset=utf-8",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        err = _require_session()
        if err:
            return {"is_error": True, "detail": err}

        payload: dict[str, Any] = {
            "session_id": session_id,
            "step": step,
            "filename": filename,
            "content": content,
            "content_type": content_type,
            "metadata": metadata or {},
        }
        if run_id:
            payload["run_id"] = run_id
        try:
            async with httpx.AsyncClient(timeout=http_timeout_seconds) as client:
                resp = await client.post(
                    internal_url,
                    json=payload,
                    headers=_headers(internal_token),
                )
        except httpx.HTTPError as exc:
            logger.exception("artifact_write transport error: %s", exc)
            return {"is_error": True, "detail": f"transport error: {exc!r}"}

        if resp.status_code >= 400:
            logger.warning(
                "artifact_write %s failed %s: %s",
                filename,
                resp.status_code,
                resp.text[:500],
            )
            return {
                "is_error": True,
                "status": resp.status_code,
                "detail": _safe_json(resp),
            }
        return resp.json()

    async def _artifact_write_csv(
        step: str,
        filename: str,
        columns: list[str] | str,
        rows: list[dict[str, Any]] | str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Encode rows into RFC 4180 CSV (QUOTE_ALL) and upsert as artifact.

        LLMs are bad at hand-quoting CSV fields that contain commas, quotes,
        or newlines — especially with Chinese punctuation. This tool removes
        that responsibility entirely: caller supplies columns + rows, we
        handle encoding.

        Defensive decoding: some models (notably DeepSeek) sometimes emit
        array params as JSON-encoded strings instead of real arrays, which
        silently corrupts output (iterating a string yields one char per
        "column"). We detect and reject that shape with a clear error so
        the agent can retry — rather than auto-coercing and hiding the bug.
        """
        err = _require_session()
        if err:
            return {"is_error": True, "detail": err}

        columns = _coerce_json_list(columns, "columns")
        if isinstance(columns, dict) and columns.get("is_error"):
            return columns
        rows = _coerce_json_list(rows, "rows")
        if isinstance(rows, dict) and rows.get("is_error"):
            return rows

        if not columns:
            return {"is_error": True, "detail": "columns must be non-empty"}
        if not all(isinstance(c, str) for c in columns):
            return {
                "is_error": True,
                "detail": "every column name must be a string",
            }

        buf = io.StringIO()
        writer = csv.writer(buf, quoting=csv.QUOTE_ALL, lineterminator="\n")
        writer.writerow(columns)
        for idx, row in enumerate(rows):
            if not isinstance(row, dict):
                return {
                    "is_error": True,
                    "detail": f"row[{idx}] must be an object, got {type(row).__name__}",
                }
            writer.writerow(["" if row.get(c) is None else str(row[c]) for c in columns])

        enriched_meta = {
            "artifact_type": "csv",
            "csv_columns": list(columns),
            "csv_row_count": len(rows),
            **(metadata or {}),
        }
        return await _artifact_write(
            step=step,
            filename=filename,
            content=buf.getvalue(),
            content_type="text/csv; charset=utf-8",
            metadata=enriched_meta,
        )

    async def _artifact_list(
        step: str | None = None,
        filename: str | None = None,
    ) -> dict[str, Any]:
        err = _require_session()
        if err:
            return {"is_error": True, "detail": err}

        params: dict[str, str] = {"session_id": str(session_id)}
        if step:
            params["step"] = step
        if filename:
            params["filename"] = filename

        try:
            async with httpx.AsyncClient(timeout=http_timeout_seconds) as client:
                resp = await client.get(
                    internal_url,
                    params=params,
                    headers=_headers(internal_token),
                )
        except httpx.HTTPError as exc:
            logger.exception("artifact_list transport error: %s", exc)
            return {"is_error": True, "detail": f"transport error: {exc!r}"}

        if resp.status_code >= 400:
            return {
                "is_error": True,
                "status": resp.status_code,
                "detail": _safe_json(resp),
            }
        return {"artifacts": resp.json()}

    async def _artifact_read(
        step: str,
        filename: str,
    ) -> dict[str, Any]:
        """Read content by (step, filename). Internally lists then fetches."""
        listing = await _artifact_list(step=step, filename=filename)
        if listing.get("is_error"):
            return listing
        artifacts = listing.get("artifacts") or []
        if not artifacts:
            return {
                "is_error": True,
                "detail": f"artifact not found: step={step} filename={filename}",
            }
        artifact = artifacts[0]
        artifact_id = artifact["id"]
        content_url = f"{base}{_ARTIFACT_INTERNAL_PATH}{artifact_id}/content/"
        try:
            async with httpx.AsyncClient(timeout=http_timeout_seconds) as client:
                resp = await client.get(content_url, headers=_headers(internal_token))
        except httpx.HTTPError as exc:
            return {"is_error": True, "detail": f"transport error: {exc!r}"}

        if resp.status_code >= 400:
            return {
                "is_error": True,
                "status": resp.status_code,
                "detail": _safe_json(resp),
            }
        try:
            text = resp.content.decode("utf-8")
        except UnicodeDecodeError:
            return {
                "is_error": True,
                "detail": "artifact content is not utf-8 text",
            }
        return {
            "metadata": artifact,
            "content": _truncate(text),
        }

    write_tool = StructuredTool(
        name="artifact_write",
        description=(
            "Write (create or overwrite) an artifact to the current AI session."
            " Use for SOP step outputs: rubric.json, raw_answers.csv,"
            " calibration_report.md, graded_answers.csv, final_delta_preview.csv."
            " Upsert semantics: same (step, filename) overwrites."
        ),
        args_schema={
            "type": "object",
            "properties": {
                "step": {
                    "type": "string",
                    "description": "SOP step identifier, e.g. rubric / raw_answers / calibration / graded / final_delta",
                },
                "filename": {
                    "type": "string",
                    "description": "Target filename, e.g. rubric.json",
                },
                "content": {
                    "type": "string",
                    "description": "Full text content. Must fit within configured size limit.",
                },
                "content_type": {
                    "type": "string",
                    "description": "MIME type, default text/plain; charset=utf-8",
                },
                "metadata": {
                    "type": "object",
                    "description": "Arbitrary JSON metadata (artifact_type, rubric summary, ...)",
                },
            },
            "required": ["step", "filename", "content"],
        },
        coroutine=_artifact_write,
    )

    list_tool = StructuredTool(
        name="artifact_list",
        description=(
            "List artifacts for the current AI session, optionally filtered by"
            " step and/or filename. Call at turn start to align state."
        ),
        args_schema={
            "type": "object",
            "properties": {
                "step": {"type": "string"},
                "filename": {"type": "string"},
            },
        },
        coroutine=_artifact_list,
    )

    write_csv_tool = StructuredTool(
        name="artifact_write_csv",
        description=(
            "Write a CSV artifact from structured rows. ALWAYS prefer this over"
            " artifact_write when producing *.csv — it handles RFC 4180 quoting"
            " (commas, quotes, newlines, Chinese punctuation) correctly. Caller"
            " supplies columns + list of row objects; the tool encodes and uploads."
        ),
        args_schema={
            "type": "object",
            "properties": {
                "step": {"type": "string"},
                "filename": {
                    "type": "string",
                    "description": "Must end in .csv",
                },
                "columns": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Ordered list of CSV header names.",
                },
                "rows": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "List of row objects keyed by column name. Missing keys → empty cell.",
                },
                "metadata": {"type": "object"},
            },
            "required": ["step", "filename", "columns", "rows"],
        },
        coroutine=_artifact_write_csv,
    )

    read_tool = StructuredTool(
        name="artifact_read",
        description=(
            "Read an artifact's text content by (step, filename). Returns metadata"
            " and utf-8 content. Content longer than 200k chars is truncated."
        ),
        args_schema={
            "type": "object",
            "properties": {
                "step": {"type": "string"},
                "filename": {"type": "string"},
            },
            "required": ["step", "filename"],
        },
        coroutine=_artifact_read,
    )

    return [list_tool, read_tool, write_tool, write_csv_tool]


def _safe_json(resp: httpx.Response) -> Any:
    try:
        return resp.json()
    except Exception:
        return resp.text[:500]


def _coerce_json_list(value: Any, field: str) -> Any:
    """Accept a list, or a JSON-stringified list; reject anything else.

    Returns the decoded list on success, or an error dict on failure (caller
    must check ``isinstance(result, dict) and result.get("is_error")``).
    Some models emit array params as quoted JSON strings (e.g.
    ``columns="[\"a\", \"b\"]"``), which if passed straight into ``for c in
    columns`` silently iterates per-character. Detect and reject.
    """
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            try:
                decoded = json.loads(stripped)
            except json.JSONDecodeError as exc:
                return {
                    "is_error": True,
                    "detail": (
                        f"{field} looked like a JSON array string but failed to"
                        f" parse: {exc}. Pass a real array, not a quoted string."
                    ),
                }
            if isinstance(decoded, list):
                logger.warning(
                    "artifact_write_csv: %s was passed as JSON string; decoded it."
                    " Agent should pass a real array.",
                    field,
                )
                return decoded
        return {
            "is_error": True,
            "detail": (
                f"{field} must be a JSON array, got string. Pass a real array"
                " (e.g. [\"a\", \"b\"]), not a quoted string (e.g."
                " \"[\\\"a\\\", \\\"b\\\"]\")."
            ),
        }
    return {
        "is_error": True,
        "detail": f"{field} must be an array, got {type(value).__name__}",
    }
