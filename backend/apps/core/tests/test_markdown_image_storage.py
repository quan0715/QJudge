from apps.core.services import markdown_image_storage as storage


class RecordingClient:
    def __init__(self):
        self.calls = []

    def __getattr__(self, name):
        def record(**kwargs):
            self.calls.append((name, kwargs))

        return record


def test_store_uploads_without_bucket_checks(monkeypatch, settings):
    settings.OBJECT_STORAGE_BUCKET = "qjudge"
    client = RecordingClient()
    monkeypatch.setattr(storage, "get_markdown_image_s3_client", lambda: client)

    storage.store_markdown_image(b"png", f"markdown/2026/09/{'a' * 32}.png", "image/png")

    assert [name for name, _ in client.calls] == ["put_object"]
    assert client.calls[0][1]["Bucket"] == "qjudge"
