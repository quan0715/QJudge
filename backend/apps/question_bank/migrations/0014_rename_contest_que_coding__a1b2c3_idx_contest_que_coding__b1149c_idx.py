from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("question_bank", "0013_remove_unique_active_bank_per_user_category"),
    ]

    operations = [
        migrations.RenameIndex(
            model_name="contestquestionbinding",
            new_name="contest_que_coding__b1149c_idx",
            old_name="contest_que_coding__a1b2c3_idx",
        ),
    ]
