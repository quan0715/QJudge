from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("contests", "0067_examquestion_explanation"),
    ]

    operations = [
        migrations.DeleteModel(
            name="ExamQuestionImportSession",
        ),
    ]
