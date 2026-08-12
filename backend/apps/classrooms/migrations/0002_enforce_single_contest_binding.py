from django.db import migrations, models, transaction
from django.db.models import Count


def enforce_private_classroom_contests(apps, schema_editor):
    ClassroomContest = apps.get_model("classrooms", "ClassroomContest")
    Contest = apps.get_model("contests", "Contest")
    Submission = apps.get_model("submissions", "Submission")

    orphan_ids = list(
        Contest.objects.filter(classroom_bindings__isnull=True).values_list(
            "pk", flat=True
        )
    )
    if orphan_ids:
        Submission.objects.filter(contest_id__in=orphan_ids).delete()
        Contest.objects.filter(pk__in=orphan_ids).delete()

    duplicate_contest_ids = (
        ClassroomContest.objects.values("contest_id")
        .annotate(binding_count=Count("pk"))
        .filter(binding_count__gt=1)
        .values_list("contest_id", flat=True)
    )
    for contest_id in duplicate_contest_ids.iterator():
        binding_ids = list(
            ClassroomContest.objects.filter(contest_id=contest_id)
            .order_by("bound_at", "pk")
            .values_list("pk", flat=True)
        )
        ClassroomContest.objects.filter(pk__in=binding_ids[1:]).delete()

    Contest.objects.update(visibility="private")
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute("SET CONSTRAINTS ALL IMMEDIATE")


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        (
            "classrooms",
            "0001_initial_squashed_0008_drop_legacy_email_notifications",
        ),
        ("contests", "0095_remove_contest_question_edit_lock_fields"),
        ("submissions", "0016_submission_contest_question_binding"),
    ]

    operations = [
        migrations.RunPython(
            enforce_private_classroom_contests,
            migrations.RunPython.noop,
            atomic=True,
        ),
        migrations.AddConstraint(
            model_name="classroomcontest",
            constraint=models.UniqueConstraint(
                fields=("contest",),
                name="unique_classroom_binding_per_contest",
            ),
        ),
    ]
