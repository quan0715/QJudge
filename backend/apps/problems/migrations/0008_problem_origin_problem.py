from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("problems", "0007_add_status_counts"),
    ]

    operations = [
        migrations.AddField(
            model_name="problem",
            name="origin_problem",
            field=models.ForeignKey(blank=True, help_text="若此題由競賽題複製而來，記錄原始題目", null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="practice_copies", to="problems.problem", verbose_name="來源題目"),
        ),
    ]
