from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("problems", "0005_test_case_weight_percent_required")]

    operations = [
        migrations.RemoveField(model_name="testcase", name="score"),
    ]
