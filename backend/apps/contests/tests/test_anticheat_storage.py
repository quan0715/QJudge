from apps.contests.services.anticheat_storage import generate_put_url


class PresignClient:
    def generate_presigned_url(self, ClientMethod, Params, ExpiresIn):
        self.params = Params
        return "https://files.example.edu/signed"


def test_put_url_carries_no_tagging():
    client = PresignClient()

    generate_put_url("qjudge", "contest_1/user_2/session_x/screen_share/ts_1_seq_0001.webp", client=client)

    assert client.params == {
        "Bucket": "qjudge",
        "Key": "contest_1/user_2/session_x/screen_share/ts_1_seq_0001.webp",
        "ContentType": "image/webp",
    }


def test_presigning_uses_sigv4_for_s3_compatible_endpoints(settings):
    from urllib.parse import parse_qs, urlsplit
    from apps.contests.services.anticheat_storage import _cached_s3_client

    settings.OBJECT_STORAGE_PUBLIC_ENDPOINT_URL = 'https://storage.example.edu'
    settings.OBJECT_STORAGE_ACCESS_KEY = 'test-key'
    settings.OBJECT_STORAGE_SECRET_KEY = 'test-secret'
    settings.OBJECT_STORAGE_REGION = 'us-east-1'
    _cached_s3_client.cache_clear()
    try:
        query = parse_qs(urlsplit(generate_put_url('qjudge', 'contest_1/check.webp')).query)
        assert query.get('X-Amz-Algorithm') == ['AWS4-HMAC-SHA256']
        assert 'AWSAccessKeyId' not in query
    finally:
        _cached_s3_client.cache_clear()
