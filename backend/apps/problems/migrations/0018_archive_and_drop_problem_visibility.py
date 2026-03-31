from django.db import migrations


def archive_problem_visibility(apps, schema_editor):
    Problem = apps.get_model("problems", "Problem")
    QuestionAsset = apps.get_model("question_bank", "QuestionAsset")

    for problem in Problem.objects.exclude(question_asset_id__isnull=True).exclude(visibility__isnull=True):
        try:
            asset = QuestionAsset.objects.get(id=problem.question_asset_id)
        except QuestionAsset.DoesNotExist:
            continue

        payload = dict(asset.payload or {})
        adapters = list(payload.get("legacy_problem_adapters") or [])
        updated = False

        for adapter in adapters:
            if str(adapter.get("problem_id")) == str(problem.id):
                if adapter.get("visibility") != problem.visibility:
                    adapter["visibility"] = problem.visibility
                    updated = True
                break
        else:
            adapters.append(
                {
                    "problem_id": str(problem.id),
                    "visibility": problem.visibility,
                }
            )
            updated = True

        if updated:
            payload["legacy_problem_adapters"] = adapters
            QuestionAsset.objects.filter(id=asset.id).update(payload=payload)


class Migration(migrations.Migration):
    dependencies = [
        ("problems", "0017_archive_and_drop_legacy_problem_fields"),
        ("question_bank", "0011_question_asset_domain"),
    ]

    operations = [
        migrations.RunPython(
            archive_problem_visibility,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.RemoveField(
            model_name="problem",
            name="visibility",
        ),
    ]
