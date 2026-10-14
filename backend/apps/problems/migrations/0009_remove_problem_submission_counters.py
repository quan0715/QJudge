from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("problems", "0008_language_config_judge_languages")]

    operations = [
        migrations.RemoveField(model_name="codingproblem", name="submission_count"),
        migrations.RemoveField(model_name="codingproblem", name="accepted_count"),
        migrations.RemoveField(model_name="codingproblem", name="wa_count"),
        migrations.RemoveField(model_name="codingproblem", name="tle_count"),
        migrations.RemoveField(model_name="codingproblem", name="mle_count"),
        migrations.RemoveField(model_name="codingproblem", name="re_count"),
        migrations.RemoveField(model_name="codingproblem", name="ce_count"),
    ]
