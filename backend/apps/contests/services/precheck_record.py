"""Record the client's pre-check result as an auditable exam event.

The browser owns the pre-check gate (it is the only side that can read screen
topology, display surface and fullscreen state), so everything here is a client
assertion. It is stored under ``metadata["precheck"]`` and explicitly marked
``asserted_by: "client"`` -- never treat it as attestation. Its purpose is that
a passed pre-check leaves a record a proctor can audit afterwards, instead of
living only in the student's ``sessionStorage``.
"""

from __future__ import annotations

from typing import Any

from django.utils import timezone

from apps.contests.models import ExamEvent

PRECHECK_EVENT_TYPE = "precheck_passed"
PRECHECK_DEFINITION_ID = "precheck_passed"

_CHECK_STATUSES = frozenset({"pending", "running", "pass", "fail", "blocked"})
_MAX_CHECKS = 16
_MAX_STRING = 64


def _clean_str(value: Any, *, allowed: frozenset[str] | None = None) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()[:_MAX_STRING]
    if not trimmed:
        return None
    if allowed is not None and trimmed not in allowed:
        return None
    return trimmed


def _clean_bool(value: Any) -> bool | None:
    return value if isinstance(value, bool) else None


def _clean_int(value: Any) -> int | None:
    # bool is an int subclass; a screen count of True is not a screen count.
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value if 0 <= value <= 64 else None


def _clean_checks(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    checks: list[dict[str, str]] = []
    for item in value[:_MAX_CHECKS]:
        if not isinstance(item, dict):
            continue
        check_id = _clean_str(item.get("id"))
        status = _clean_str(item.get("status"), allowed=_CHECK_STATUSES)
        if check_id and status:
            checks.append({"id": check_id, "status": status})
    return checks


def _clean_device(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    device: dict[str, Any] = {}
    for key in (
        "device_kind",
        "pointer_profile",
        "primary_source_module",
    ):
        cleaned = _clean_str(value.get(key))
        if cleaned is not None:
            device[key] = cleaned
    for key in (
        "is_tablet",
        "is_ipad_like",
        "is_pwa_mode",
        "supports_fine_pointer",
        "screen_share_supported",
        "webcam_supported",
    ):
        cleaned = _clean_bool(value.get(key))
        if cleaned is not None:
            device[key] = cleaned
    sources = value.get("active_sources")
    if isinstance(sources, list):
        device["active_sources"] = [
            source
            for source in (_clean_str(item) for item in sources[:8])
            if source is not None
        ]
    return device


def normalize_precheck_payload(payload: Any) -> dict[str, Any] | None:
    """Whitelist the client-supplied pre-check result, or None when unusable."""
    if not isinstance(payload, dict):
        return None

    normalized: dict[str, Any] = {"asserted_by": "client"}

    for key in ("screen_count",):
        cleaned = _clean_int(payload.get(key))
        if cleaned is not None:
            normalized[key] = cleaned
    for key in ("is_extended", "fullscreen", "webcam_granted", "pwa_mode"):
        cleaned = _clean_bool(payload.get(key))
        if cleaned is not None:
            normalized[key] = cleaned
    display_surface = _clean_str(payload.get("display_surface"))
    if display_surface is not None:
        normalized["display_surface"] = display_surface
    policy_version = _clean_str(payload.get("policy_version"))
    if policy_version is not None:
        normalized["policy_version"] = policy_version

    checks = _clean_checks(payload.get("checks"))
    if checks:
        normalized["checks"] = checks
    device = _clean_device(payload.get("device"))
    if device:
        normalized["device"] = device

    # A payload carrying nothing beyond the provenance marker is not a record.
    return normalized if len(normalized) > 1 else None


def record_precheck_passed(
    *,
    participant,
    payload: Any,
    integrity_run=None,
    client_occurred_at_ms: Any = None,
) -> ExamEvent | None:
    """Write one ``precheck_passed`` event. Never raises into the exam flow."""
    normalized = normalize_precheck_payload(payload)
    if normalized is None:
        return None

    occurred_at_ms = _clean_int_ms(client_occurred_at_ms)
    return ExamEvent.objects.create(
        contest=participant.contest,
        user=participant.user,
        event_type=PRECHECK_EVENT_TYPE,
        integrity_run=integrity_run,
        event_definition_version=(
            getattr(integrity_run, "registry_version", "") or ""
        ),
        client_occurred_at_ms=occurred_at_ms,
        server_received_at=timezone.now(),
        metadata={
            "precheck": normalized,
            # Mirrors the shape record_integrity_event writes so projections,
            # priority and penalty resolution treat it like any other event.
            "integrity": {
                "definition_id": PRECHECK_DEFINITION_ID,
                "phase": "triggered",
                "action": "record",
            },
        },
    )


def _clean_int_ms(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value if 0 < value < 4_102_444_800_000 else None
