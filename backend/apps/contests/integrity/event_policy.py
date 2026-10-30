"""Pure event policy shared by command enforcement and event presentation.

No ORM or transport dependencies belong here. The worker remains responsible
for incident timing; the backend validates and applies its proposed actions.
"""

REGISTRY_ACTIONS = {
    "audit": "audit",
    "record": "record",
    "record_event": "record",
    "pause": "pause",
    "lock": "lock",
    "submit": "submit",
}


def default_registry_action(definition: dict, phase: str, *, delayed_delivery: bool) -> str:
    action = REGISTRY_ACTIONS.get(definition.get("action"))
    signals = definition.get("signals")
    if action is None or type(signals) is not dict:
        raise ValueError("invalid_frozen_registry")
    if delayed_delivery or phase == "restored":
        return "audit"
    if phase == "triggered" and (signals.get("escalated") or signals.get("restored")):
        return "record"
    return action


def registry_action_is_penalty(phase, action, definition: dict) -> bool:
    signals = definition.get("signals")
    if not isinstance(phase, str) or not isinstance(signals, dict) or not signals.get(phase):
        return False
    # Apply to frozen registries too: clipboard use is retained as evidence only.
    if isinstance(signals, dict) and signals.get("triggered") == "clipboard_action":
        return False
    # System lifecycle records (entry/submission) are evidence of normal use,
    # not violations. Explicit pause/lock/submit actions remain actionable.
    if action == "record" and definition.get("priority") == 3:
        return False
    incident_opening = bool(
        phase == "triggered"
        and action == "record"
        and isinstance(signals, dict)
        and (signals.get("escalated") or signals.get("restored"))
    )
    return bool(
        phase in {"triggered", "escalated"}
        and action in {"record", "pause", "lock", "submit"}
        and not incident_opening
    )

