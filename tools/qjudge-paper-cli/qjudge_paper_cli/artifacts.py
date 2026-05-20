from __future__ import annotations

from pathlib import Path
from typing import Any

from .api import QJudgeApiClient


def download_text_artifacts(
    *,
    client: QJudgeApiClient,
    session_id: str,
    output_dir: Path,
    filenames: set[str] | None = None,
) -> list[dict[str, Any]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    selected = filenames or {"rubric.md", "grade.csv"}
    downloaded: list[dict[str, Any]] = []
    for artifact in client.list_artifacts(session_id=session_id):
        filename = artifact.get("filename")
        artifact_id = artifact.get("id")
        if filename not in selected or not artifact_id:
            continue
        content = client.artifact_content(str(artifact_id))
        local_path = output_dir / str(filename)
        local_path.write_text(content, encoding="utf-8")
        downloaded.append(
            {
                "id": artifact_id,
                "filename": filename,
                "local_path": str(local_path),
                "updated_at": artifact.get("updated_at"),
            }
        )
    return downloaded
