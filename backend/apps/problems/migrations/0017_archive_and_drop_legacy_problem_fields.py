from django.db import migrations


def archive_legacy_problem_adapter_fields(apps, schema_editor):
    Problem = apps.get_model("problems", "Problem")
    QuestionAsset = apps.get_model("question_bank", "QuestionAsset")

    asset_payloads = {}

    problems = Problem.objects.exclude(question_asset_id__isnull=True).iterator()
    for problem in problems:
        legacy_entry = {"problem_id": str(problem.id)}

        if getattr(problem, "legacy_int_id", None) is not None:
            legacy_entry["legacy_int_id"] = problem.legacy_int_id
        display_id = getattr(problem, "display_id", None)
        if display_id:
            legacy_entry["display_id"] = display_id
        if getattr(problem, "created_in_contest_id", None):
            legacy_entry["created_in_contest_id"] = str(problem.created_in_contest_id)
        if getattr(problem, "origin_problem_id", None):
            legacy_entry["origin_problem_id"] = str(problem.origin_problem_id)

        if len(legacy_entry) == 1:
            continue

        asset_id = problem.question_asset_id
        if asset_id not in asset_payloads:
            asset = QuestionAsset.objects.filter(pk=asset_id).only("id", "payload").first()
            payload = dict(asset.payload or {}) if asset is not None else {}
            adapters = payload.get("legacy_problem_adapters")
            if not isinstance(adapters, list):
                adapters = []
            asset_payloads[asset_id] = {"payload": payload, "adapters": adapters}

        adapters = asset_payloads[asset_id]["adapters"]
        existing = next(
            (entry for entry in adapters if isinstance(entry, dict) and entry.get("problem_id") == str(problem.id)),
            None,
        )
        if existing is None:
            adapters.append(legacy_entry)
        else:
            existing.update(legacy_entry)

    for asset_id, item in asset_payloads.items():
        payload = item["payload"]
        payload["legacy_problem_adapters"] = item["adapters"]
        QuestionAsset.objects.filter(pk=asset_id).update(payload=payload)


class Migration(migrations.Migration):

    dependencies = [
        ("question_bank", "0011_question_asset_domain"),
        ("problems", "0016_problem_question_asset_links"),
    ]

    operations = [
        migrations.RunPython(
            archive_legacy_problem_adapter_fields,
            migrations.RunPython.noop,
        ),
        migrations.RemoveField(
            model_name="problem",
            name="created_in_contest",
        ),
        migrations.RemoveField(
            model_name="problem",
            name="origin_problem",
        ),
        migrations.RemoveField(
            model_name="problem",
            name="display_id",
        ),
        migrations.RemoveField(
            model_name="problem",
            name="legacy_int_id",
        ),
    ]
