"""Resident v2 purge rejects unverified or out-of-run object references."""
import hashlib
import json
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import pytest

from apps.contests.services import integrity_evidence as service


def archive(*, change=None):
    run = SimpleNamespace(id=uuid4(), archive_generation=1)
    candidate, digest = str(uuid4()), "a" * 64
    payload = {
        "schema_version": 2, "run_id": str(run.id), "resident_revision": 2,
        "candidate_id": candidate,
        "segments": [{"sha256": digest,
                      "object_key": f"runs/{run.id}/resident-segments/{digest}.journal.gz"}],
    }
    if change:
        change(payload)
    content = json.dumps(payload).encode()
    run.archive_manifest_sha256 = hashlib.sha256(content).hexdigest()
    run.archive_manifest_key = (f"runs/{run.id}/resident-revision-2/{candidate}/"
                                f"{run.archive_manifest_sha256}.json")
    client = Mock()
    client.get_object.return_value = {"ContentLength": len(content), "Body": BytesIO(content)}
    return run, client, payload


@pytest.mark.parametrize("empty", [False, True])
def test_resident_manifest_snapshot_keys(empty):
    run, client, payload = archive(change=lambda p: p.update(segments=[]) if empty else None)
    assert service._load_archive_manifest_chain(client, run) == {
        run.archive_manifest_key, *(s["object_key"] for s in payload["segments"]),
    }
    assert client.get_object.return_value["Body"].closed


@pytest.mark.parametrize("change", [
    lambda p: p.update(run_id=str(uuid4())),
    lambda p: p.update(schema_version=1),
    lambda p: p.update(resident_revision=3),
    lambda p: p.update(resident_revision=True),
    lambda p: p.update(candidate_id=str(uuid4())),
    lambda p: p.update(segments={}),
    lambda p: p.update(segments=[None]),
    lambda p: p["segments"][0].update(sha256="b" * 64),
    lambda p: p["segments"][0].update(object_key=f"runs/{uuid4()}/resident-segments/{'a' * 64}.journal.gz"),
    lambda p: p["segments"][0].update(object_key=p["segments"][0]["object_key"] + "/../other"),
])
def test_resident_manifest_rejects_invalid_scope_before_delete(change):
    run, client, _ = archive(change=change)
    with pytest.raises(service.IntegrityEvidenceStorageError):
        service._load_archive_manifest_chain(client, run)
    client.delete_objects.assert_not_called()


def test_resident_manifest_rejects_corrupt_body():
    run, client, _ = archive()
    client.get_object.return_value = {"ContentLength": 2, "Body": BytesIO(b"{}")}
    with pytest.raises(service.IntegrityEvidenceStorageError, match="checksum"):
        service._load_archive_manifest_chain(client, run)


def test_resident_manifest_checks_key_hash_before_read():
    run, client, _ = archive()
    run.archive_manifest_sha256 = "f" * 64
    with pytest.raises(service.IntegrityEvidenceStorageError):
        service._load_archive_manifest_chain(client, run)
    client.get_object.assert_not_called()


def test_resident_manifest_bounds_key_budget(monkeypatch):
    run, client, _ = archive()
    monkeypatch.setattr(service, "_MAX_PURGE_KEYS", 1)
    with pytest.raises(service.IntegrityEvidenceStorageError, match="too large"):
        service._load_archive_manifest_chain(client, run)
