from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("contests", "0090_exam_integrity_models"),
    ]

    operations = [
        migrations.AlterField(
            model_name="contestactivity",
            name="action_type",
            field=models.CharField(
                choices=[
                    ("register", "Register"),
                    ("enter_contest", "Enter Contest"),
                    ("start_exam", "Start Exam"),
                    ("resume_exam", "Resume Exam"),
                    ("end_exam", "End Exam"),
                    ("auto_submit", "Auto Submit"),
                    ("lock_user", "Lock User"),
                    ("unlock_user", "Unlock User"),
                    ("submit_code", "Submit Code"),
                    ("ask_question", "Ask Question"),
                    ("reply_question", "Reply Question"),
                    ("update_contest", "Update Contest"),
                    ("update_problem", "Update Problem"),
                    ("update_participant", "Update Participant"),
                    ("reopen_exam", "Reopen Exam"),
                    ("reset_exam_record", "Reset Exam Record"),
                    ("concurrent_login_detected", "Concurrent Login Detected"),
                    ("other_devices_logged_out", "Other Devices Logged Out"),
                    ("announce", "Announce"),
                    ("other", "Other"),
                ],
                max_length=50,
                verbose_name="動作類型",
            ),
        ),
    ]
