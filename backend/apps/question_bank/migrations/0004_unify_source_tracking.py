"""
Replace source_problem / source_exam_question FKs with unified
source_question (self-FK) + source_bank FK.  Backfill from metadata
for cloned questions.
"""
from django.db import migrations, models
import django.db.models.deletion


def backfill_source_from_metadata(apps, schema_editor):
    """
    For questions that were cloned from another bank question,
    populate source_question and source_bank from metadata fields.
    """
    Question = apps.get_model("question_bank", "Question")

    for q in Question.objects.filter(metadata__cloned_from_question_id__isnull=False):
        cloned_from_id = q.metadata.get("cloned_from_question_id")
        cloned_from_bank_pk = q.metadata.get("cloned_from_bank_pk")
        if cloned_from_id:
            q.source_question_id = cloned_from_id
        if cloned_from_bank_pk:
            q.source_bank_id = cloned_from_bank_pk
        q.save(update_fields=["source_question_id", "source_bank_id"])


class Migration(migrations.Migration):
    dependencies = [
        ("question_bank", "0003_question_title_blank_for_exam"),
    ]

    operations = [
        # 1. Add new fields
        migrations.AddField(
            model_name="question",
            name="source_question",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="derived_questions",
                to="question_bank.question",
            ),
        ),
        migrations.AddField(
            model_name="question",
            name="source_bank",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="sourced_questions",
                to="question_bank.questionbank",
            ),
        ),
        # 2. Backfill from metadata
        migrations.RunPython(
            backfill_source_from_metadata,
            migrations.RunPython.noop,
        ),
        # 3. Remove old indexes (must happen before removing the fields)
        migrations.RemoveIndex(
            model_name="question",
            name="questions_source__aa7397_idx",
        ),
        migrations.RemoveIndex(
            model_name="question",
            name="questions_source__a31de3_idx",
        ),
        # 4. Remove old fields
        migrations.RemoveField(
            model_name="question",
            name="source_problem",
        ),
        migrations.RemoveField(
            model_name="question",
            name="source_exam_question",
        ),
        # 5. Add new composite index
        migrations.AddIndex(
            model_name="question",
            index=models.Index(
                fields=["source_bank", "source_question"],
                name="questions_source__unified_idx",
            ),
        ),
    ]
