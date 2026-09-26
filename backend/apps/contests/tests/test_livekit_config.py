"""Pure unit tests for LiveKitConfig.configured — no DB required."""

from apps.contests.services.livekit_service import LiveKitConfig


def _config(**overrides) -> LiveKitConfig:
    values = dict(
        enabled=True,
        provider="livekit",
        public_url="wss://livekit.example.test",
        internal_url="http://livekit:7880",
        api_key="qjudge-test-key",
        api_secret="qjudge-test-secret",
        room_prefix="qjudge-exam",
        token_ttl_seconds=120,
    )
    values.update(overrides)
    return LiveKitConfig(**values)


class TestLiveKitConfigConfigured:
    def test_configured_true_with_url_and_credentials(self):
        config = _config()

        assert config.configured is True

    def test_configured_false_when_disabled(self):
        config = _config(enabled=False)

        assert config.configured is False

    def test_configured_false_when_provider_is_not_livekit(self):
        config = _config(provider="disabled")

        assert config.configured is False

    def test_configured_false_when_missing_public_url(self):
        config = _config(public_url="")

        assert config.configured is False

    def test_configured_false_when_missing_internal_url(self):
        config = _config(internal_url="")

        assert config.configured is False

    def test_configured_false_when_missing_api_key(self):
        config = _config(api_key="")

        assert config.configured is False

    def test_configured_false_when_missing_api_secret(self):
        config = _config(api_secret="")

        assert config.configured is False
