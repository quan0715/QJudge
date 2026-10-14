from django.db import migrations


def _as_weight(value):
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _percentages(raw_weights):
    """Scale non-negative weights to integers summing to 100 (largest remainder)."""
    total = sum(raw_weights)
    if total == 100:
        return raw_weights
    if total <= 0:
        base, remainder = divmod(100, len(raw_weights))
        return [base + (1 if idx < remainder else 0) for idx in range(len(raw_weights))]
    scaled = [weight * 100 / total for weight in raw_weights]
    weights = [int(value) for value in scaled]
    by_fraction = sorted(range(len(scaled)), key=lambda idx: scaled[idx] - weights[idx], reverse=True)
    for idx in by_fraction[: 100 - sum(weights)]:
        weights[idx] += 1
    return weights


def _migrate_payload(payload):
    cases = payload.get("test_cases") if isinstance(payload, dict) else None
    if not cases or not all(isinstance(case, dict) for case in cases):
        return None
    raw_weights = [
        _as_weight(case["weight_percent"] if case.get("weight_percent") is not None else case.get("score"))
        for case in cases
    ]
    migrated = [
        {**{key: value for key, value in case.items() if key != "score"}, "weight_percent": weight}
        for case, weight in zip(cases, _percentages(raw_weights))
    ]
    if migrated == cases:
        return None
    return {**payload, "test_cases": migrated}


def migrate_test_case_weights(apps, schema_editor):
    for model_name in ("QuestionAsset", "QuestionVersion"):
        model = apps.get_model("question_bank", model_name)
        for pk, payload in model.objects.values_list("pk", "payload").iterator():
            migrated = _migrate_payload(payload)
            if migrated is not None:
                model.objects.filter(pk=pk).update(payload=migrated)


class Migration(migrations.Migration):
    dependencies = [
        ("contests", "0010_drop_question_version"),
        ("problems", "0004_test_case_weights_and_cleanup"),
        ("question_bank", "0003_align_legacy_schema"),
    ]

    operations = [
        # Versions are migrated too: they exist until the model is dropped below.
        migrations.RunPython(migrate_test_case_weights, migrations.RunPython.noop),
        # Run the deferred constraint checks queued by the data change, or
        # PostgreSQL refuses the ALTER TABLEs below in the same transaction.
        migrations.RunSQL("SET CONSTRAINTS ALL IMMEDIATE", migrations.RunSQL.noop),
        migrations.RemoveField(model_name="contestquestionbinding", name="question_version"),
        migrations.RemoveField(model_name="questionasset", name="latest_version"),
        migrations.DeleteModel(name="QuestionVersion"),
    ]
