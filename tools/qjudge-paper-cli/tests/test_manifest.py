import json
from pathlib import Path

import pytest

from qjudge_paper_cli.manifest import write_manifest


def test_write_manifest_rejects_token_fields(tmp_path: Path):
    with pytest.raises(ValueError, match="token"):
        write_manifest(
            tmp_path / "manifest.json",
            {
                "run_id": "run-1",
                "access_token": "secret",
            },
        )


def test_write_manifest_records_read_only_run(tmp_path: Path):
    path = tmp_path / "manifest.json"

    write_manifest(
        path,
        {
            "run_id": "run-1",
            "official_grades_modified": False,
        },
    )

    payload = json.loads(path.read_text())

    assert payload["run_id"] == "run-1"
    assert payload["official_grades_modified"] is False
