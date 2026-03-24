from __future__ import annotations

import copy

from django.db import migrations


DEVICE_KINDS = ("desktop", "tablet")
SOURCE_KINDS = ("screen_share", "webcam")


def _drop_required_keys(policy: dict) -> bool:
    changed = False
    for device in DEVICE_KINDS:
        device_policy = policy.get(device)
        if not isinstance(device_policy, dict):
            continue
        sources = device_policy.get("sources")
        if not isinstance(sources, dict):
            continue
        for source in SOURCE_KINDS:
            source_policy = sources.get(source)
            if not isinstance(source_policy, dict):
                continue
            if "required" in source_policy:
                source_policy.pop("required", None)
                changed = True
    return changed


def _remove_required_from_anticheat_policy(apps, schema_editor):
    Contest = apps.get_model("contests", "Contest")
    for contest in Contest.objects.only("id", "anticheat_device_policy").iterator(chunk_size=200):
        existing_policy = contest.anticheat_device_policy
        if not isinstance(existing_policy, dict):
            continue

        normalized_policy = copy.deepcopy(existing_policy)
        if not _drop_required_keys(normalized_policy):
            continue

        Contest.objects.filter(pk=contest.pk).update(anticheat_device_policy=normalized_policy)


class Migration(migrations.Migration):

    dependencies = [
        ("contests", "0053_exam_event_pipeline_types"),
    ]

    operations = [
        migrations.RunPython(
            _remove_required_from_anticheat_policy,
            migrations.RunPython.noop,
        ),
    ]
