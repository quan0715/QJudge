from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("question_bank", "0004_unify_source_tracking"),
    ]

    operations = [
        migrations.AddField(
            model_name="questionbank",
            name="cover_url",
            field=models.URLField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="questionbank",
            name="icon",
            field=models.CharField(blank=True, default="", max_length=32),
        ),
    ]
