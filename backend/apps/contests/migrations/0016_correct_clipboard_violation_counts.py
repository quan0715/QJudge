"""Remove historical clipboard penalties without altering the evidence records."""

from django.db import migrations


def was_counted(event):
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    integrity = metadata.get("integrity")
    if not isinstance(integrity, dict):
        return False
    if integrity.get("counted_as_violation") is False or event.delayed_delivery:
        return False
    if integrity.get("action") != "record" or integrity.get("phase") != "triggered":
        return False
    run = event.integrity_run
    if run is None or not isinstance(run.registry_snapshot, dict):
        return False
    definitions = run.registry_snapshot.get("definitions", {})
    definition = definitions.get(integrity.get("definition_id"), {})
    signals = definition.get("signals", {})
    # Mirror the previous penalty rule, using the event's frozen registry.
    return (
        signals.get("triggered") == "clipboard_action"
        and definition.get("priority") != 3
        and not signals.get("escalated")
        and not signals.get("restored")
    )


def correct_counts(apps, schema_editor):
    alias = schema_editor.connection.alias
    Contest = apps.get_model("contests", "Contest")
    Participant = apps.get_model("contests", "ContestParticipant")
    Event = apps.get_model("contests", "ExamEvent")
    clipboard = Event.objects.using(alias).filter(event_type="clipboard_action")
    contest_ids = clipboard.order_by().values_list("contest_id", flat=True).distinct()
    for contest_id in sorted(contest_ids):
        # Same lock order as integrity ingestion and attempt reset.
        Contest.objects.using(alias).select_for_update().get(pk=contest_id)
        participants = Participant.objects.using(alias).filter(
            contest_id=contest_id, violation_count__gt=0,
        ).select_for_update().order_by("pk")
        for participant in participants:
            events = clipboard.filter(
                contest_id=contest_id, user_id=participant.user_id,
            ).select_related("integrity_run")
            deduction = sum(was_counted(event) for event in events.iterator())
            if deduction:
                participant.violation_count = max(0, participant.violation_count - deduction)
                participant.save(using=alias, update_fields=["violation_count"])


class Migration(migrations.Migration):
    dependencies = [("contests", "0015_exam_question_optional_prompt")]

    # Intentionally irreversible: rolling back must not restore false penalties.
    # Django's migration ledger prevents repeat deductions on subsequent deploys.
    operations = [migrations.RunPython(correct_counts)]
