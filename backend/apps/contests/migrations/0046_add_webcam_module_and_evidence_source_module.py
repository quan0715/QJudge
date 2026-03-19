from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("contests", "0045_add_screen_share_interrupted_event_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="contest",
            name="webcam_module_enabled",
            field=models.BooleanField(
                default=False,
                help_text="啟用後可使用 webcam 作為補充監考來源",
                verbose_name="啟用 Webcam 監考模組",
            ),
        ),
        migrations.AddField(
            model_name="contest",
            name="webcam_required_on_tablet",
            field=models.BooleanField(
                default=True,
                help_text="平板裝置在降級模式下必須開啟 webcam",
                verbose_name="平板強制 Webcam",
            ),
        ),
        migrations.AddField(
            model_name="examevidencejob",
            name="source_module",
            field=models.CharField(blank=True, default="screen_share", max_length=32),
        ),
        migrations.AddField(
            model_name="examevidencevideo",
            name="source_module",
            field=models.CharField(blank=True, default="screen_share", max_length=32),
        ),
        migrations.RemoveConstraint(
            model_name="examevidencejob",
            name="uniq_evidence_job_contest_participant_session",
        ),
        migrations.AddConstraint(
            model_name="examevidencejob",
            constraint=models.UniqueConstraint(
                fields=("contest", "participant", "source_module", "upload_session_id"),
                name="uniq_evidence_job_contest_participant_module_session",
            ),
        ),
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
                    ("screen_share_interrupted", "Screen Share Interrupted"),
                    ("screen_share_restored", "Screen Share Restored"),
                    ("screen_share_invalid_surface", "Screen Share Invalid Surface"),
                    ("webcam_interrupted", "Webcam Interrupted"),
                    ("webcam_restored", "Webcam Restored"),
                    ("webcam_stopped", "Webcam Stopped"),
                    ("webcam_quality_degraded", "Webcam Quality Degraded"),
                    ("capture_upload_degraded", "Capture Upload Degraded"),
                    ("exam_entered", "Exam Entered"),
                    ("exam_submit_initiated", "Exam Submit Initiated"),
                    ("concurrent_login_detected", "Concurrent Login Detected"),
                    ("takeover_locked", "Takeover Locked"),
                    ("takeover_approved", "Takeover Approved"),
                    ("heartbeat", "Heartbeat"),
                    ("heartbeat_timeout", "Heartbeat Timeout"),
                    ("listener_tampered", "Listener Tampered"),
                    ("exit_fullscreen_triggered", "Exit Fullscreen Triggered"),
                    ("mouse_leave_triggered", "Mouse Leave Triggered"),
                ],
                max_length=50,
                verbose_name="事件類型",
            ),
        ),
    ]
