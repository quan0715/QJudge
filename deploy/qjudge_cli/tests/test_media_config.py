import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from deploy.qjudge_cli.media_config import (
    render_coturn_config,
    render_livekit_config,
    write_media_config,
)


MEDIA_ENV = {
    "LIVEKIT_API_KEY": "qjudge-key",
    "LIVEKIT_API_SECRET": "qjudge-api-secret",
    "LIVEKIT_NODE_IP": "192.0.2.10",
    "LIVEKIT_TURN_HOST": "turn.example.test",
    "LIVEKIT_TURN_SECRET": "qjudge-turn-secret",
}


class MediaConfigTests(unittest.TestCase):
    def test_livekit_config_uses_qjudge_ports_and_shared_turn_secret(self):
        config = json.loads(render_livekit_config(MEDIA_ENV))

        self.assertEqual(config["port"], 7880)
        self.assertEqual(config["rtc"]["tcp_port"], 7881)
        self.assertEqual(config["rtc"]["port_range_start"], 50000)
        self.assertEqual(config["rtc"]["port_range_end"], 50099)
        self.assertEqual(config["rtc"]["node_ip"], "192.0.2.10")
        self.assertIs(config["rtc"]["use_external_ip"], False)
        self.assertEqual(config["keys"], {"qjudge-key": "qjudge-api-secret"})
        self.assertNotIn("turn", config)
        self.assertEqual(
            config["rtc"]["turn_servers"],
            [
                {
                    "host": "turn.example.test",
                    "port": 3478,
                    "protocol": "udp",
                    "secret": "qjudge-turn-secret",
                    "ttl": 3600,
                },
                {
                    "host": "turn.example.test",
                    "port": 3478,
                    "protocol": "tcp",
                    "secret": "qjudge-turn-secret",
                    "ttl": 3600,
                },
                {
                    "host": "turn.example.test",
                    "port": 443,
                    "protocol": "tls",
                    "secret": "qjudge-turn-secret",
                    "ttl": 3600,
                },
            ],
        )

    def test_coturn_config_uses_same_shared_secret_and_relay_range(self):
        config = render_coturn_config(MEDIA_ENV)

        self.assertIn("listening-port=3478", config)
        self.assertIn("tls-listening-port=5349", config)
        self.assertIn("cert=/etc/letsencrypt/live/qjudge-media/fullchain.pem", config)
        self.assertIn("pkey=/etc/letsencrypt/live/qjudge-media/privkey.pem", config)
        self.assertIn("no-tlsv1", config)
        self.assertIn("no-tlsv1_1", config)
        self.assertIn("realm=turn.example.test", config)
        self.assertIn("use-auth-secret", config)
        self.assertIn("static-auth-secret=qjudge-turn-secret", config)
        self.assertIn("proc-user=nobody", config)
        self.assertIn("proc-group=nogroup", config)
        self.assertIn("min-port=50300", config)
        self.assertIn("max-port=50399", config)
        self.assertIn("external-ip=192.0.2.10", config)
        self.assertNotIn("listening-ip=", config)
        self.assertNotIn("relay-ip=", config)

    def test_coturn_config_relays_only_to_livekit_node_ip(self):
        lines = render_coturn_config(MEDIA_ENV).splitlines()

        for directive in ("no-tcp-relay", "no-multicast-peers", "no-cli", "fingerprint"):
            self.assertIn(directive, lines)
        self.assertIn("denied-peer-ip=0.0.0.0-255.255.255.255", lines)
        self.assertIn("denied-peer-ip=::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", lines)
        self.assertEqual([line for line in lines if line.startswith("allowed-peer-ip=")],
                         ["allowed-peer-ip=192.0.2.10"])

    def test_write_media_config_creates_private_runtime_files(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            deploy_dir = Path(temporary_directory) / "deploy"

            livekit_path, coturn_path = write_media_config(deploy_dir, MEDIA_ENV)

            self.assertEqual(livekit_path, deploy_dir / "secrets" / "livekit.json")
            self.assertEqual(coturn_path, deploy_dir / "secrets" / "turnserver.conf")
            self.assertTrue(livekit_path.is_file())
            self.assertTrue(coturn_path.is_file())
            self.assertEqual(livekit_path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(coturn_path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(livekit_path.read_text())["keys"]["qjudge-key"],
                             "qjudge-api-secret")
            self.assertIn("static-auth-secret=qjudge-turn-secret", coturn_path.read_text())

    def test_write_media_config_restricts_existing_files_before_overwriting(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            deploy_dir = Path(temporary_directory) / "deploy"
            secrets_dir = deploy_dir / "secrets"
            secrets_dir.mkdir(parents=True)
            livekit_path = secrets_dir / "livekit.json"
            coturn_path = secrets_dir / "turnserver.conf"
            livekit_path.write_text("old livekit data", encoding="utf-8")
            coturn_path.write_text("old coturn data", encoding="utf-8")
            livekit_path.chmod(0o644)
            coturn_path.chmod(0o644)

            observed_modes = []
            original_open = os.open

            def observe_mode_before_open(path, flags, mode):
                observed_modes.append(Path(path).stat().st_mode & 0o777)
                return original_open(path, flags, mode)

            with patch("deploy.qjudge_cli.media_config.os.open", side_effect=observe_mode_before_open):
                write_media_config(deploy_dir, MEDIA_ENV)

            self.assertEqual(observed_modes, [0o600, 0o600])
            self.assertEqual(livekit_path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(coturn_path.stat().st_mode & 0o777, 0o600)
            self.assertNotEqual(livekit_path.read_text(encoding="utf-8"), "old livekit data")
            self.assertNotEqual(coturn_path.read_text(encoding="utf-8"), "old coturn data")


if __name__ == "__main__":
    unittest.main()
