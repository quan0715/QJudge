import json
import stat

import pytest

from scripts.livekit.render_config import (
    ConfigError,
    render_config,
    render_coturn_config,
)


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


def test_render_config_can_advertise_internal_candidates_alongside_node_ip():
    rendered = render_config(
        _environment(LIVEKIT_ADVERTISE_INTERNAL_IP="true")
    )

    assert rendered["rtc"]["advertise_internal_ip"] is True


def test_render_config_adds_external_turn_servers_for_coturn():
    rendered = render_config(
        _environment(
            LIVEKIT_STUN_HOST="turn.q-judge.com:3478",
            LIVEKIT_TURN_ENABLED="true",
            LIVEKIT_TURN_HOST="turn.q-judge.com",
            LIVEKIT_TURN_SECRET="turn-shared-secret",
        )
    )

    assert rendered["rtc"]["stun_servers"] == ["turn.q-judge.com:3478"]
    assert rendered["rtc"]["turn_servers"] == [
        {
            "host": "turn.q-judge.com",
            "port": 3478,
            "protocol": "udp",
            "secret": "turn-shared-secret",
            "ttl": 300,
        },
        {
            "host": "turn.q-judge.com",
            "port": 3478,
            "protocol": "tcp",
            "secret": "turn-shared-secret",
            "ttl": 300,
        },
    ]


def test_render_coturn_config_matches_livekit_relay_contract(tmp_path):
    output_path = tmp_path / "coturn.conf"

    config = render_coturn_config(
        _environment(
            LIVEKIT_STUN_HOST="turn.q-judge.com:3478",
            LIVEKIT_TURN_ENABLED="true",
            LIVEKIT_TURN_HOST="turn.q-judge.com",
            LIVEKIT_TURN_SECRET="turn-shared-secret",
        ),
        output_path,
    )

    assert "use-auth-secret" in config
    assert "static-auth-secret=turn-shared-secret" in config
    assert "external-ip=192.0.2.10" in config
    assert "listening-ip=192.0.2.10" in config
    assert "relay-ip=192.0.2.10" in config
    assert "min-port=50300" in config
    assert "max-port=50399" in config
    assert stat.S_IMODE(output_path.stat().st_mode) == 0o600
    assert output_path.read_text() == config


def test_render_coturn_config_supports_separate_local_bind_ip():
    config = render_coturn_config(
        _environment(
            LIVEKIT_STUN_HOST="turn.q-judge.com:3478",
            LIVEKIT_TURN_ENABLED="true",
            LIVEKIT_TURN_HOST="turn.q-judge.com",
            LIVEKIT_TURN_SECRET="turn-shared-secret",
            LIVEKIT_TURN_LOCAL_IP="10.0.0.25",
        )
    )

    assert "external-ip=192.0.2.10/10.0.0.25" in config
    assert "listening-ip=10.0.0.25" in config
    assert "relay-ip=10.0.0.25" in config


def test_render_config_rejects_public_stun_host_without_matching_turn_service():
    with pytest.raises(ConfigError, match="LIVEKIT_STUN_HOST"):
        render_config(
            _environment(
                LIVEKIT_STUN_HOST="stun.q-judge.com:3478",
                LIVEKIT_TURN_ENABLED="true",
                LIVEKIT_TURN_HOST="turn.q-judge.com",
                LIVEKIT_TURN_SECRET="turn-shared-secret",
            )
        )


def test_render_config_rejects_public_stun_host_with_turn_port_mismatch():
    with pytest.raises(ConfigError, match="LIVEKIT_STUN_HOST"):
        render_config(
            _environment(
                LIVEKIT_STUN_HOST="turn.q-judge.com:9999",
                LIVEKIT_TURN_ENABLED="true",
                LIVEKIT_TURN_HOST="turn.q-judge.com",
                LIVEKIT_TURN_SECRET="turn-shared-secret",
            )
        )


def test_render_config_rejects_stun_host_path():
    with pytest.raises(ConfigError, match="LIVEKIT_STUN_HOST must not contain a path"):
        render_config(_environment(LIVEKIT_STUN_HOST="turn.q-judge.com:3478/path"))


def test_render_config_rejects_turn_listener_port_conflicts():
    with pytest.raises(ConfigError, match="TURN listening port"):
        render_config(
            _environment(
                LIVEKIT_TURN_ENABLED="true",
                LIVEKIT_TURN_HOST="turn.q-judge.com",
                LIVEKIT_TURN_SECRET="turn-shared-secret",
                LIVEKIT_TURN_PORT="7890",
            )
        )


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
