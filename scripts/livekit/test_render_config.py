import json
import stat

import pytest

from scripts.livekit.render_config import ConfigError, render_config


def _environment(**overrides):
    values = {
        "LIVEKIT_ENVIRONMENT": "test",
        "LIVEKIT_PUBLIC_URL": "wss://livekit.example.test",
        "LIVEKIT_INTERNAL_URL": "http://livekit:7880",
        "LIVEKIT_API_KEY": "qjudge-test-key",
        "LIVEKIT_API_SECRET": "qjudge-test-secret",
        "LIVEKIT_NODE_IP": "192.0.2.10",
        "LIVEKIT_STUN_HOST": "stun.example.test:3478",
        "LIVEKIT_IMAGE": f"livekit/livekit-server@sha256:{'a' * 64}",
        "LIVE_MONITORING_ENABLED": "true",
    }
    values.update(overrides)
    return values


def test_render_config_writes_pinned_runtime_config_without_stdout_secret(tmp_path, capsys):
    output_path = tmp_path / "livekit-test.json"

    rendered = render_config(_environment(), output_path)

    assert rendered["room"] == {"auto_create": False, "max_participants": 160}
    assert rendered["rtc"]["use_external_ip"] is False
    assert rendered["rtc"]["node_ip"] == "192.0.2.10"
    assert rendered["rtc"]["stun_servers"] == ["stun.example.test:3478"]
    assert rendered["keys"] == {"qjudge-test-key": "qjudge-test-secret"}
    assert "qjudge-test-secret" not in capsys.readouterr().out
    assert json.loads(output_path.read_text()) == rendered
    assert stat.S_IMODE(output_path.stat().st_mode) == 0o600


@pytest.mark.parametrize(
    "missing",
    ["LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "LIVEKIT_NODE_IP"],
)
def test_render_config_rejects_missing_required_values(missing):
    values = _environment()
    values.pop(missing)

    with pytest.raises(ConfigError, match=missing):
        render_config(values)


def test_render_config_rejects_public_stun_host():
    with pytest.raises(ConfigError, match="LIVEKIT_STUN_HOST"):
        render_config(_environment(LIVEKIT_STUN_HOST="stun.l.google.com:19302"))


def test_render_config_accepts_private_dns_stun_host():
    rendered = render_config(
        _environment(LIVEKIT_STUN_HOST="turn.internal.example.edu:3478")
    )

    assert rendered["rtc"]["stun_servers"] == ["turn.internal.example.edu:3478"]


def test_render_config_rejects_unpinned_or_malformed_image_digest():
    with pytest.raises(ConfigError, match="LIVEKIT_IMAGE"):
        render_config(_environment(LIVEKIT_IMAGE="livekit/livekit-server:latest"))


def test_render_config_is_noop_when_live_monitoring_is_disabled(tmp_path):
    output_path = tmp_path / "disabled.json"

    rendered = render_config(
        _environment(
            LIVE_MONITORING_ENABLED="false",
            LIVEKIT_API_KEY="",
            LIVEKIT_API_SECRET="",
            LIVEKIT_NODE_IP="",
            LIVEKIT_STUN_HOST="",
        ),
        output_path,
    )

    assert rendered == {"room": {"auto_create": False, "max_participants": 160}}
    assert json.loads(output_path.read_text()) == rendered
