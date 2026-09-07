"""Schedule synchronization must reject stale scope without poisoning retries."""
from dataclasses import replace
import json
from uuid import uuid4

import pytest

from test_resident_api import setup, put, sign
from test_worker_api import batch_payload, NOW_MS


def post(client, key, descriptor, suffix, payload, revision):
    path = f"/v1/runs/{descriptor.bootstrap.run_id}/{suffix}"
    body = json.dumps(payload).encode()
    return client.post(path, content=body, headers=sign(
        key, "POST", path, descriptor.bootstrap.run_id, revision, body))


@pytest.mark.parametrize("descriptor_first", [False, True])
def test_schedule_race_rejects_without_receipt_then_retries_original_batch(setup, descriptor_first, monkeypatch):
    key, d, registry, client = setup
    assert put(client, key, d).status_code == 200
    updated = replace(d, schedule_revision=2, scheduled_end_ms=NOW_MS + 20000)
    batch = batch_payload()
    if descriptor_first:
        assert put(client, key, updated).status_code == 200
    result = post(client, key, d, "batches", batch, 1 if descriptor_first else 2)
    assert result.status_code == 409
    assert result.json().get("error", {}).get("code") == "resident_schedule_sync_pending"
    runtime = registry.get(d.bootstrap.run_id)
    assert runtime.receipts.pending() == ()
    assert "acked_through_seq" not in result.json()
    if not descriptor_first:
        assert put(client, key, updated).status_code == 200
    result = post(client, key, d, "batches", batch, 2)
    assert result.status_code == 200
    assert result.json()["acked_through_seq"] == 1
    original = runtime.receipts.receipt_at(1)
    assert original.batch.model_dump(mode="json") == batch
    assert original.received_at_ms == NOW_MS
    assert runtime.process_pending(1) == 1
    monkeypatch.setattr("test_resident_api.NOW_MS", NOW_MS + 5000)
    assert post(client, key, d, "batches", batch, 2).status_code == 200
    assert runtime.receipts.receipt_at(1) == original


@pytest.mark.parametrize("descriptor_first", [False, True])
def test_progress_schedule_race_never_returns_stale_progress(setup, descriptor_first):
    key, d, registry, client = setup
    assert put(client, key, d).status_code == 200
    updated = replace(d, schedule_revision=2, scheduled_end_ms=NOW_MS + 20000)
    batch = batch_payload()
    assert post(client, key, d, "batches", batch, 1).status_code == 200
    scope = {"participant_id": batch["participant_id"], "device_id": batch["device_id"]}
    if descriptor_first:
        assert put(client, key, updated).status_code == 200
    result = post(client, key, d, "progress", scope, 1 if descriptor_first else 2)
    assert result.status_code == 409
    assert result.json().get("error", {}).get("code") == "resident_schedule_sync_pending"
    assert "received_seq" not in result.json()
    if not descriptor_first:
        assert put(client, key, updated).status_code == 200
    registry.get(d.bootstrap.run_id).process_pending(1)
    result = post(client, key, d, "progress", scope, 2)
    assert result.status_code == 200
    assert result.json()["received_seq"] == result.json()["processed_seq"] == 1


@pytest.mark.parametrize("conflict", ["run", "batch", "sequence", "attempt", "closed"])
def test_genuine_conflicts_do_not_claim_schedule_retry(setup, conflict):
    key, d, registry, client = setup
    assert put(client, key, d).status_code == 200
    batch = batch_payload()
    attempt = uuid4()
    envelope = {"batch": batch, "late_unverified": False, "attempt_id": str(attempt)}
    assert post(client, key, d, "batches", envelope, 1).status_code == 200
    if conflict == "run":
        batch["run_id"] = str(uuid4())
    elif conflict == "batch":
        batch["records"][0]["client_recorded_at_ms"] += 1
    elif conflict == "sequence":
        batch["batch_id"] = str(uuid4())
        batch["records"][0]["event_id"] = str(uuid4())
    elif conflict == "attempt":
        envelope["attempt_id"] = str(uuid4())
    else:
        assert put(client, key, replace(d, session_state="closed")).status_code == 200
    result = post(client, key, d, "batches", envelope, 1)
    assert result.status_code == 409
    assert result.json().get("error", {}).get("code") != "resident_schedule_sync_pending"
    assert "acked_through_seq" not in result.json()


def test_progress_rechecks_revision_when_its_receipt_job_executes(setup, monkeypatch):
    key, d, registry, client = setup
    assert put(client, key, d).status_code == 200
    pool = client.app.state.receipts
    run_job = pool.run

    async def schedule_changes_before_job(*args, **kwargs):
        registry.ensure(replace(d, schedule_revision=2, scheduled_end_ms=NOW_MS + 20000))
        return await run_job(*args, **kwargs)

    monkeypatch.setattr(pool, "run", schedule_changes_before_job)
    result = post(client, key, d, "progress", {"participant_id": 101, "device_id": "device-a"}, 1)
    assert result.status_code == 409
    assert result.json().get("error", {}).get("code") == "resident_schedule_sync_pending"
