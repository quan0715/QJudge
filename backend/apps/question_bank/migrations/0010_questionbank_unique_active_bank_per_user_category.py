from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("question_bank", "0009_remove_legacy_int_id"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="questionbank",
            constraint=models.UniqueConstraint(
                condition=models.Q(is_archived=False, owner__isnull=False),
                fields=["owner", "category"],
                name="unique_active_bank_per_user_category",
            ),
        ),
    ]
