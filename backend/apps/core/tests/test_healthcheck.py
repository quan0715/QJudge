from unittest.mock import MagicMock, call, patch

from django.test import SimpleTestCase, override_settings

from apps.core.management.commands.healthcheck import Command


class HealthcheckCommandTests(SimpleTestCase):
    @override_settings(
        OBJECT_STORAGE_ENDPOINT_URL="https://example.r2.cloudflarestorage.com",
        ANTICHEAT_RAW_BUCKET="qjudge-anticheat-raw",
        MARKDOWN_IMAGE_S3_BUCKET="qjudge-markdown-images",
        AI_ARTIFACT_S3_BUCKET="qjudge-ai-artifacts",
    )
    @patch("apps.contests.services.anticheat_storage.get_s3_client")
    def test_object_storage_connection_uses_bucket_scoped_probe(self, mock_get_client):
        client = MagicMock()
        mock_get_client.return_value = client

        ok, detail = Command()._check_object_storage_connection()

        self.assertTrue(ok)
        self.assertIn("qjudge-anticheat-raw", detail)
        client.list_objects_v2.assert_called_once_with(
            Bucket="qjudge-anticheat-raw",
            MaxKeys=0,
        )
        client.list_buckets.assert_not_called()

    @override_settings(
        ANTICHEAT_RAW_BUCKET="qjudge-anticheat-raw",
        MARKDOWN_IMAGE_S3_BUCKET="qjudge-markdown-images",
        AI_ARTIFACT_S3_BUCKET="qjudge-ai-artifacts",
    )
    @patch("apps.contests.services.anticheat_storage.get_s3_client")
    def test_object_storage_buckets_use_head_bucket(self, mock_get_client):
        client = MagicMock()
        mock_get_client.return_value = client

        ok, detail = Command()._check_object_storage_buckets()

        self.assertTrue(ok)
        self.assertIn("qjudge-ai-artifacts", detail)
        client.head_bucket.assert_has_calls(
            [
                call(Bucket="qjudge-anticheat-raw"),
                call(Bucket="qjudge-markdown-images"),
                call(Bucket="qjudge-ai-artifacts"),
            ]
        )
        client.list_buckets.assert_not_called()

    @override_settings(CELERY_TASK_DEFAULT_QUEUE="default")
    @patch.object(Command, "_ping_celery_queue")
    def test_celery_default_uses_configured_default_queue(self, mock_ping):
        mock_ping.return_value = (True, "worker=celery@worker")

        ok, detail = Command()._check_celery_default()

        self.assertTrue(ok)
        self.assertEqual(detail, "worker=celery@worker")
        mock_ping.assert_called_once_with("default")

    def test_celery_queue_failure_reports_active_queues(self):
        command = Command()
        active_queues = {
            "celery@worker-1": [{"name": "default"}],
            "celery@worker-2": [{"name": "high_priority"}],
        }
        inspector = MagicMock()
        inspector.active_queues.return_value = active_queues
        celery_app = MagicMock()
        celery_app.control.inspect.return_value = inspector

        with patch("config.celery.app", celery_app):
            ok, detail = command._ping_celery_queue("celery")

        self.assertFalse(ok)
        self.assertEqual(
            detail,
            "no worker consuming 'celery' (active: default, high_priority)",
        )
