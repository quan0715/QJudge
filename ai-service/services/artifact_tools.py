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
        offset: int = 0,
        limit: int | None = None,
    ) -> dict[str, Any]:
        """Read content by (step, filename). Internally lists then fetches.

        ``offset`` / ``limit`` mirror DeepAgent's ``read_file`` semantics —
        line-based pagination so the agent can treat artifact content the
        same way it treats virtual-FS files. When both are omitted the
        whole content is returned (with the 200k-char safety truncation).
        """
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

        total_lines = text.count("\n") + (0 if text.endswith("\n") else 1) if text else 0
        if offset or limit is not None:
            lines = text.splitlines(keepends=True)
            start = max(int(offset), 0)
            end = start + int(limit) if limit is not None else len(lines)
            text = "".join(lines[start:end])

        return {
            "metadata": artifact,
            "content": _truncate(text),
            "total_lines": total_lines,
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

    async def _artifact_csv_from_json(
        step: str,
        filename: str,
        records: list[dict[str, Any]] | str,
        column_mapping: dict[str, str] | str | None = None,
        defaults: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Map a list of records through a column spec and write as CSV.

        Spares the agent from building rows by hand. Common case:
            records = <qjudge_grading(action="list_answers") response>
            column_mapping = {
                "exam_answer_id": "exam_answer_id",
                "student_id":     "username",
                "answer_text":    "answer.text",    # dot-path for nested keys
                "original_score": "score",
            }
            defaults = {"new_score": "", "reason": ""}

        If the MCP result was offloaded to the virtual FS (DeepAgent does this
        at ~20k tokens), the agent should `read_file` it first and pass the
        file content here — this tool auto-parses JSON strings.
        """
        err = _require_session()
        if err:
            return {"is_error": True, "detail": err}

        records = _coerce_json_list(records, "records")
        if isinstance(records, dict) and records.get("is_error"):
            return records

        if column_mapping is None:
            # Identity mapping: use the keys of the first record as-is. Lets the
            # agent pipe an MCP result whose rows already match the CSV shape
            # straight through with zero ceremony.
            first = next((r for r in records if isinstance(r, dict)), None)
            if first is None:
                return {"is_error": True, "detail": "records is empty; cannot infer column_mapping"}
            mapping: dict[str, str] = {k: k for k in first.keys()}
        else:
            mapping = _coerce_json_dict(column_mapping, "column_mapping")
            if isinstance(mapping, dict) and mapping.get("is_error"):
                return mapping
            if not isinstance(mapping, dict):
                return {"is_error": True, "detail": "column_mapping must be an object"}
            if not mapping:
                return {"is_error": True, "detail": "column_mapping must be non-empty"}

        defaults = defaults or {}
        if not isinstance(defaults, dict):
            return {"is_error": True, "detail": "defaults must be an object"}

        columns = list(mapping.keys()) + [k for k in defaults if k not in mapping]
        rows: list[dict[str, Any]] = []
        for idx, record in enumerate(records):
            if not isinstance(record, dict):
                return {
                    "is_error": True,
                    "detail": f"records[{idx}] must be an object, got {type(record).__name__}",
                }
            row: dict[str, Any] = {}
            for target_col, source_path in mapping.items():
                if not isinstance(source_path, str):
                    return {
                        "is_error": True,
                        "detail": f"column_mapping['{target_col}'] must be a string path",
                    }
                row[target_col] = _resolve_dot_path(record, source_path)
            for target_col, const_value in defaults.items():
                row.setdefault(target_col, const_value)
            rows.append(row)

        return await _artifact_write_csv(
            step=step,
            filename=filename,
            columns=columns,
            rows=rows,
            metadata={
                "artifact_type": "csv",
                "csv_source": "records_mapping",
                **(metadata or {}),
            },
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
            "Read an artifact's text content by (step, filename). Returns"
            " metadata, utf-8 content, and total_lines. Optional offset/limit"
            " paginate by line (same semantics as DeepAgent's read_file) for"
            " large artifacts. Without pagination content is truncated at"
            " 200k chars as a safety net."
        ),
        args_schema={
            "type": "object",
            "properties": {
                "step":     {"type": "string"},
                "filename": {"type": "string"},
                "offset":   {"type": "integer", "minimum": 0, "description": "0-based line offset"},
                "limit":    {"type": "integer", "minimum": 1, "description": "max lines to return"},
            },
            "required": ["step", "filename"],
        },
        coroutine=_artifact_read,
    )

    async def _artifact_csv_patch(
        step: str,
        filename: str,
        key_column: str,
        updates: list[dict[str, Any]] | str,
    ) -> dict[str, Any]:
        """Merge partial-row updates into an existing CSV artifact.

        Solves the "越跑越少" bug:``artifact_write_csv`` fully overwrites
        the object, so an agent that sends only its freshly-processed batch
        silently deletes every other row. With this tool the agent sends
        ONLY the rows it changed; we read the current CSV, locate each row
        by ``key_column``, apply the partial update, and write the full set
        back. Rows whose keys don't match any existing row are returned as
        ``missing`` so the caller can decide how to handle them.
        """
        err = _require_session()
        if err:
            return {"is_error": True, "detail": err}

        updates = _coerce_json_list(updates, "updates")
        if isinstance(updates, dict) and updates.get("is_error"):
            return updates
        if not updates:
            return {"is_error": True, "detail": "updates must be non-empty"}

        existing = await _artifact_read(step=step, filename=filename)
        if existing.get("is_error"):
            return existing

        try:
            reader = csv.DictReader(io.StringIO(existing["content"]))
            columns = list(reader.fieldnames or [])
            rows = [dict(row) for row in reader]
        except csv.Error as exc:
            return {"is_error": True, "detail": f"existing CSV parse error: {exc}"}

        if key_column not in columns:
            return {
                "is_error": True,
                "detail": f"key_column '{key_column}' not in CSV columns {columns}",
            }

        index = {str(row.get(key_column, "")): i for i, row in enumerate(rows)}
        updated = 0
        missing: list[str] = []
        for idx, patch in enumerate(updates):
            if not isinstance(patch, dict):
                return {
                    "is_error": True,
                    "detail": f"updates[{idx}] must be an object, got {type(patch).__name__}",
                }
            key_value = patch.get(key_column)
            if key_value is None:
                return {
                    "is_error": True,
                    "detail": f"updates[{idx}] missing key_column '{key_column}'",
                }
            row_idx = index.get(str(key_value))
            if row_idx is None:
                missing.append(str(key_value))
                continue
            for col, value in patch.items():
                if col == key_column or col not in columns:
                    continue
                rows[row_idx][col] = "" if value is None else str(value)
            updated += 1

        write_result = await _artifact_write_csv(
            step=step,
            filename=filename,
            columns=columns,
            rows=rows,
        )
        if isinstance(write_result, dict) and write_result.get("is_error"):
            return write_result

        return {
            "updated": updated,
            "missing": missing,
            "total_rows": len(rows),
            "artifact": write_result,
        }

    csv_from_json_tool = StructuredTool(
        name="artifact_csv_from_json",
        description=(
            "Write/seed a CSV artifact from JSON records (a list of objects)."
            " Intended for turning an MCP/API response directly into a CSV file."
            " Optional `column_mapping` renames or flattens nested keys via"
            " dot-paths (e.g. 'answer.text'). Optional `defaults` appends extra"
            " constant columns (e.g. blank score/reason). records accepts inline"
            " list or JSON string (in case an offloaded response was read_file'd"
            " first)."
        ),
        args_schema={
            "type": "object",
            "properties": {
                "step":     {"type": "string"},
                "filename": {"type": "string"},
                "records": {
                    "description": "list of record objects, OR JSON-string of such a list",
                },
                "column_mapping": {
                    "type": "object",
                    "description": "target CSV column → source dot-path in each record",
                    "additionalProperties": {"type": "string"},
                },
                "defaults": {
                    "type": "object",
                    "description": "extra CSV columns with constant values (e.g. {new_score: ''})",
                },
                "metadata": {"type": "object"},
            },
            "required": ["step", "filename", "records"],
        },
        coroutine=_artifact_csv_from_json,
    )

    csv_patch_tool = StructuredTool(
        name="artifact_csv_patch",
        description=(
            "Merge partial updates into an existing CSV artifact by key."
            " Use this to write back a batch of changes without overwriting"
            " unchanged rows: pass ONLY the rows you changed, identified by"
            " `key_column`. Unmatched keys are returned as `missing`."
        ),
        args_schema={
            "type": "object",
            "properties": {
                "step":       {"type": "string"},
                "filename":   {"type": "string"},
                "key_column": {"type": "string", "description": "column name to match rows on"},
                "updates": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Each object must include key_column; other fields overwrite existing cells.",
                },
            },
            "required": ["step", "filename", "key_column", "updates"],
        },
        coroutine=_artifact_csv_patch,
    )

    async def _load_filtered_csv(
        step: str,
        filename: str,
        where: dict[str, Any] | str | None,
    ) -> dict[str, Any]:
        """Shared helper: read CSV + apply equality-only where filter.

        Returns ``{"all_columns", "rows", "filtered"}`` on success,
        or ``{"is_error": True, "detail": ...}`` on failure.
        """
        if where is not None:
            where = _coerce_json_dict(where, "where")
            if isinstance(where, dict) and where.get("is_error"):
                return where

        existing = await _artifact_read(step=step, filename=filename)
        if existing.get("is_error"):
            return existing

        try:
            reader = csv.DictReader(io.StringIO(existing["content"]))
            all_columns = list(reader.fieldnames or [])
            rows = [dict(row) for row in reader]
        except csv.Error as exc:
            return {"is_error": True, "detail": f"CSV parse error: {exc}"}

        if where:
            unknown = [c for c in where if c not in all_columns]
            if unknown:
                return {
                    "is_error": True,
                    "detail": f"unknown where columns {unknown}; CSV has {all_columns}",
                }

            def _match(row: dict[str, str]) -> bool:
                for col, expected in where.items():
                    cell = row.get(col, "")
                    expected_str = "" if expected is None else str(expected)
                    if str(cell if cell is not None else "") != expected_str:
                        return False
                return True

            filtered = [r for r in rows if _match(r)]
        else:
            filtered = list(rows)

        return {"all_columns": all_columns, "rows": rows, "filtered": filtered}

    async def _artifact_csv_search(
        step: str,
        filename: str,
        where: dict[str, Any] | str | None = None,
    ) -> dict[str, Any]:
        """Count rows matching a where-filter. Does NOT return row data.

        Use this to answer "how many rows still have score empty?" or "how
        many unsynced rows remain?" — cheap status check before deciding
        whether/what to batch next. For the actual payload, call
        ``artifact_csv_to_json`` with ``columns`` + ``limit``.
        """
        err = _require_session()
        if err:
            return {"is_error": True, "detail": err}

        loaded = await _load_filtered_csv(step=step, filename=filename, where=where)
        if loaded.get("is_error"):
            return loaded

        return {
            "matched": len(loaded["filtered"]),
            "total_rows": len(loaded["rows"]),
        }

    async def _artifact_csv_to_json(
        step: str,
        filename: str,
        columns: list[str] | str,
        where: dict[str, Any] | str | None = None,
        offset: int = 0,
        limit: int | None = None,
    ) -> dict[str, Any]:
        """Export matching rows as JSON records with an explicit column projection.

        Intended for building MCP payloads like
        ``grades=[{exam_answer_id, score, reason}, ...]`` from a CSV without
        hand-parsing. ``columns`` is REQUIRED so the agent is forced to declare
        the payload shape explicitly. ``where``/``offset``/``limit`` follow the
        same rules as ``artifact_csv_search``.
        """
        err = _require_session()
        if err:
            return {"is_error": True, "detail": err}

        columns = _coerce_json_list(columns, "columns")
        if isinstance(columns, dict) and columns.get("is_error"):
            return columns
        if not columns:
            return {"is_error": True, "detail": "columns must be non-empty"}
        if not all(isinstance(c, str) for c in columns):
            return {"is_error": True, "detail": "every column name must be a string"}

        loaded = await _load_filtered_csv(step=step, filename=filename, where=where)
        if loaded.get("is_error"):
            return loaded

        unknown = [c for c in columns if c not in loaded["all_columns"]]
        if unknown:
            return {
                "is_error": True,
                "detail": f"unknown columns {unknown}; CSV has {loaded['all_columns']}",
            }

        filtered = loaded["filtered"]
        total_matched = len(filtered)
        start = max(int(offset), 0)
        end = start + int(limit) if limit is not None else total_matched
        paged = filtered[start:end]
        records = [{c: r.get(c, "") for c in columns} for r in paged]

        return {
            "count": len(records),
            "total_matched": total_matched,
            "records": records,
        }

    csv_search_tool = StructuredTool(
        name="artifact_csv_search",
        description=(
            "Count rows in a CSV artifact that match an equality filter."
            " Returns only {matched, total_rows} — no row data. Use this to"
            " answer status questions like 'how many rows still need grading?'"
            " or 'how many unsynced rows remain?' cheaply, without pulling any"
            " content into context. For the payload itself, call artifact_csv_to_json."
        ),
        args_schema={
            "type": "object",
            "properties": {
                "step":     {"type": "string"},
                "filename": {"type": "string"},
                "where": {
                    "type": "object",
                    "description": (
                        "Equality filters as {column: expected_value}. AND-combined."
                        " Use \"\" to match empty cells. Omit to count all rows."
                    ),
                },
            },
            "required": ["step", "filename"],
        },
        coroutine=_artifact_csv_search,
    )

    csv_to_json_tool = StructuredTool(
        name="artifact_csv_to_json",
        description=(
            "Export matching CSV rows as JSON records for use as an MCP/API"
            " payload (e.g. grades=[{exam_answer_id, score, reason}, ...])."
            " `columns` is REQUIRED to force an explicit payload shape; `where`"
            " is equality-only (empty string matches empty cells);"
            " `offset`/`limit` paginate the filtered rows. Returns"
            " {count, total_matched, records}."
        ),
        args_schema={
            "type": "object",
            "properties": {
                "step":     {"type": "string"},
                "filename": {"type": "string"},
                "columns": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Payload columns to project. Required.",
                },
                "where": {
                    "type": "object",
                    "description": (
                        "Equality filters as {column: expected_value}. AND-combined."
                        " Use \"\" to match empty cells."
                    ),
                },
                "offset": {"type": "integer", "minimum": 0},
                "limit":  {"type": "integer", "minimum": 1},
            },
            "required": ["step", "filename", "columns"],
        },
        coroutine=_artifact_csv_to_json,
    )

    return [
        list_tool,
        read_tool,
        write_tool,
        write_csv_tool,
        csv_from_json_tool,
        csv_patch_tool,
        csv_search_tool,
        csv_to_json_tool,
    ]


def _safe_json(resp: httpx.Response) -> Any:
    try:
        return resp.json()
    except Exception:
        return resp.text[:500]


def _resolve_dot_path(obj: Any, path: str) -> Any:
    """Resolve 'a.b.c' → obj['a']['b']['c']. Returns None if any step is missing."""
    current = obj
    for key in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(key)
        if current is None:
            return None
    return current


def _coerce_json_dict(value: Any, field: str) -> Any:
    """Accept a dict, or a JSON-stringified dict; reject anything else."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith("{") and stripped.endswith("}"):
            try:
                decoded = json.loads(stripped)
            except json.JSONDecodeError as exc:
                return {
                    "is_error": True,
                    "detail": (
                        f"{field} looked like a JSON object string but failed to"
                        f" parse: {exc}."
                    ),
                }
            if isinstance(decoded, dict):
                logger.warning(
                    "artifact tool: %s was passed as JSON string; decoded it.",
                    field,
                )
                return decoded
        return {
            "is_error": True,
            "detail": f"{field} must be a JSON object, got string.",
        }
    return {
        "is_error": True,
        "detail": f"{field} must be an object, got {type(value).__name__}",
    }


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
