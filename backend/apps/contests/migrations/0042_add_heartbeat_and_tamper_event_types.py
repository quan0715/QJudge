# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("contests", "0041_alter_examevent_event_type"),
    ]

    operations = [
        migrations.AlterField(
            model_name="examevent",
            name="event_type",
            field=models.CharField(
                choices=[
                    ("tab_hidden", "Tab Hidden"),
                    ("window_blur", "Window Blur"),
                    ("exit_fullscreen", "Exit Fullscreen"),
                    ("forbidden_focus_event", "Forbidden Focus Event"),
                    ("forbidden_action", "Forbidden Action"),
                    ("multiple_displays", "Multiple Displays"),
                    ("mouse_leave", "Mouse Leave"),
                    ("warning_timeout", "Warning Timeout"),
                    ("force_submit_locked", "Force Submit Locked"),
                    ("screen_share_stopped", "Screen Share Stopped"),
                    ("screen_share_invalid_surface", "Screen Share Invalid Surface"),
                    ("capture_upload_degraded", "Capture Upload Degraded"),
                    ("exam_entered", "Exam Entered"),
                    ("exam_submit_initiated", "Exam Submit Initiated"),
                    ("concurrent_login_detected", "Concurrent Login Detected"),
                    ("takeover_locked", "Takeover Locked"),
                    ("takeover_approved", "Takeover Approved"),
                    ("heartbeat", "Heartbeat"),
                    ("heartbeat_timeout", "Heartbeat Timeout"),
                    ("listener_tampered", "Listener Tampered"),
                ],
                max_length=50,
                verbose_name="事件類型",
            ),
        ),
    ]
