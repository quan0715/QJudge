from django.db import migrations


def _percentages(scores):
    """Scale non-negative scores to integers summing to 100 (largest remainder)."""
    total = sum(scores)
    if total <= 0:
        base, remainder = divmod(100, len(scores))
        return [base + (1 if idx < remainder else 0) for idx in range(len(scores))]
    scaled = [score * 100 / total for score in scores]
    weights = [int(value) for value in scaled]
    by_fraction = sorted(range(len(scores)), key=lambda idx: scaled[idx] - weights[idx], reverse=True)
    for idx in by_fraction[: 100 - sum(weights)]:
        weights[idx] += 1
    return weights


def backfill_weight_percent(apps, schema_editor):
    TestCase = apps.get_model("problems", "TestCase")
    problem_ids = (
        TestCase.objects.filter(weight_percent__isnull=True)
        .values_list("problem_id", flat=True)
        .distinct()
    )
    for problem_id in list(problem_ids):
        cases = list(TestCase.objects.filter(problem_id=problem_id).order_by("order", "id"))
        weights = _percentages([max(0, case.score or 0) for case in cases])
        for case, weight in zip(cases, weights):
            case.weight_percent = weight
            case.score = weight
        TestCase.objects.bulk_update(cases, ["weight_percent", "score"])


class Migration(migrations.Migration):
    dependencies = [("problems", "0003_align_legacy_schema")]

    operations = [
        migrations.RunPython(backfill_weight_percent, migrations.RunPython.noop),
    ]
