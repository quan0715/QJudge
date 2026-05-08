from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("contests", "0077_remove_contest_anonymous_mode"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="contest",
            name="password",
        ),
        migrations.AddField(
            model_name="contest",
            name="attendance_check_enabled",
            field=models.BooleanField(
                default=False,
                help_text="啟用後學生需先完成 QR 簽到與現場照片佐證才可開始考試",
                verbose_name="啟用 QR 簽到簽退",
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
                    ("viewport_interrupted", "Viewport Interrupted"),
                    ("viewport_restored", "Viewport Restored"),
                    ("viewport_stopped", "Viewport Stopped"),
                    ("split_view_detected", "Split View Detected"),
                    ("capture_upload_degraded", "Capture Upload Degraded"),
                    ("exam_entered", "Exam Entered"),
                    ("exam_submit_initiated", "Exam Submit Initiated"),
                    ("concurrent_login_detected", "Concurrent Login Detected"),
                    ("heartbeat", "Heartbeat"),
                    ("heartbeat_timeout", "Heartbeat Timeout"),
                    ("listener_tampered", "Listener Tampered"),
                    ("exit_fullscreen_triggered", "Exit Fullscreen Triggered"),
                    ("mouse_leave_triggered", "Mouse Leave Triggered"),
                    ("tab_hidden_triggered", "Tab Hidden Triggered"),
                    ("tab_hidden_restored", "Tab Hidden Restored"),
                    ("window_blur_triggered", "Window Blur Triggered"),
                    ("window_blur_restored", "Window Blur Restored"),
                    ("multi_display_triggered", "Multi Display Triggered"),
                    ("multi_display_restored", "Multi Display Restored"),
                    ("display_api_degraded", "Display API Degraded"),
                    ("clipboard_action", "Clipboard Action"),
                    ("attendance_check_in", "Attendance Check-in"),
                    ("attendance_check_out", "Attendance Check-out"),
                ],
                max_length=50,
                verbose_name="事件類型",
            ),
        ),
        migrations.AlterField(
            model_name="examevidenceframe",
            name="source_module",
            field=models.CharField(
                choices=[
                    ("screen_share", "Screen Share"),
                    ("webcam", "Webcam"),
                    ("attendance", "Attendance"),
                ],
                default="screen_share",
                max_length=20,
            ),
        ),
    ]
