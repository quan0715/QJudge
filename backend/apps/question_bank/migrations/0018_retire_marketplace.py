from django.db import migrations


def normalize_question_banks(apps, schema_editor):
    QuestionBank = apps.get_model("question_bank", "QuestionBank")
    QuestionBank.objects.update(visibility="private")
    QuestionBank.objects.filter(owner__isnull=True).update(is_archived=True)


class Migration(migrations.Migration):

    dependencies = [
        ("question_bank", "0017_eliminate_question_bank_legacy_adapters"),
    ]

    operations = [
        migrations.RunPython(normalize_question_banks, migrations.RunPython.noop),
        migrations.DeleteModel(name="QuestionBankSubscription"),
        migrations.RemoveIndex(
            model_name="questionbank",
            name="question_ba_review__a85cf3_idx",
        ),
        migrations.RemoveIndex(
            model_name="questionbank",
            name="question_ba_visibil_e871b7_idx",
        ),
        migrations.RemoveField(model_name="questionbank", name="reviewed_by"),
        migrations.RemoveField(model_name="questionbank", name="review_note"),
        migrations.RemoveField(model_name="questionbank", name="review_status"),
        migrations.RemoveField(model_name="questionbank", name="reviewed_at"),
        migrations.RemoveField(model_name="questionbank", name="submitted_at"),
        migrations.RemoveField(model_name="questionbank", name="verified"),
        migrations.RemoveField(model_name="questionbank", name="visibility"),
    ]
