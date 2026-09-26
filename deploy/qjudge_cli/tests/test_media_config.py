import json
import tempfile
import unittest
from pathlib import Path

from qjudge_cli.media_config import render_livekit_config, write_media_config


MEDIA_ENV = {
    "LIVEKIT_API_KEY": "qjudge-key",
    "LIVEKIT_API_SECRET": "qjudge-api-secret",
    "LIVEKIT_NODE_IP": "192.0.2.10",
    "LIVEKIT_TURN_HOST": "turn.example.test",
}


class MediaConfigTests(unittest.TestCase):
    def test_livekit_config_uses_qjudge_ports_and_node_ip(self):
        config = json.loads(render_livekit_config(MEDIA_ENV))

        self.assertEqual(config["port"], 7880)
        self.assertEqual(
            config["rtc"],
            {"tcp_port": 7881, "port_range_start": 50000, "port_range_end": 50099, "node_ip": "192.0.2.10"},
        )
        self.assertEqual(config["keys"], {"qjudge-key": "qjudge-api-secret"})

    def test_livekit_runs_embedded_turn_behind_external_tls(self):
        config = json.loads(render_livekit_config(MEDIA_ENV))

        self.assertEqual(
            config["turn"],
            {
                "enabled": True,
                "domain": "turn.example.test",
                "udp_port": 3478,
                "tls_port": 5349,
                "external_tls": True,
                "relay_range_start": 50300,
                "relay_range_end": 50399,
            },
        )

    def test_write_media_config_reports_changes_and_is_private(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            deploy_dir = Path(temporary_directory) / "deploy"
            config_path = deploy_dir / "secrets" / "livekit.json"

            self.assertTrue(write_media_config(deploy_dir, MEDIA_ENV))
            self.assertFalse(write_media_config(deploy_dir, MEDIA_ENV))
            self.assertEqual(config_path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(config_path.read_text())["keys"], {"qjudge-key": "qjudge-api-secret"})

            self.assertTrue(write_media_config(deploy_dir, {**MEDIA_ENV, "LIVEKIT_NODE_IP": "192.0.2.11"}))
            self.assertEqual(json.loads(config_path.read_text())["rtc"]["node_ip"], "192.0.2.11")


if __name__ == "__main__":
    unittest.main()
