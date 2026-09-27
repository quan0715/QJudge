import unittest

from qjudge_cli.ingress import render_ingress, render_nginx
from qjudge_cli.tests.test_check import VALID


class IngressTests(unittest.TestCase):
    def test_bundled_storage_entry(self):
        text = render_ingress(VALID)
        self.assertIn("https://files.example.edu", text)
        self.assertIn("http://127.0.0.1:9000", text)

    def test_external_storage_has_no_entry(self):
        self.assertNotIn("Storage", render_ingress({**VALID, "STORAGE_MODE": "external"}))

    def test_tunnel_routes_storage_to_minio(self):
        text = render_ingress({**VALID, "COMPOSE_PROFILES": "tunnel", "TUNNEL_TOKEN": "t"})
        self.assertIn("route files.example.edu -> http://minio:9000", text)

    def test_nginx_includes_storage_server(self):
        text = render_nginx(VALID)
        self.assertIn("server_name files.example.edu;", text)
        self.assertIn("proxy_pass http://127.0.0.1:9000;", text)
        self.assertIn("client_max_body_size 0;", text)

    def test_local_frontend_defaults(self):
        text = render_ingress(VALID)
        self.assertIn("https://judge.example.edu", text)
        self.assertIn("http://127.0.0.1:8080", text)
        self.assertIn(
            "curl -H 'Host: judge.example.edu' -H 'X-Forwarded-Proto: https' http://127.0.0.1:8080/api/health/",
            text,
        )
        self.assertIn("/mcp", text)

    def test_remote_proxy_uses_bind_address(self):
        env = {**VALID, "FRONTEND_BIND_ADDRESS": "10.0.0.5", "FRONTEND_PORT": "18080",
               "QJUDGE_TRUSTED_PROXIES": "10.0.0.2"}
        text = render_ingress(env)
        self.assertIn("http://10.0.0.5:18080", text)
        self.assertIn("10.0.0.2", text)

    def test_tunnel_route_is_listed_when_profile_enabled(self):
        text = render_ingress({**VALID, "COMPOSE_PROFILES": "tunnel", "TUNNEL_TOKEN": "t"})
        self.assertIn("http://frontend:80", text)

    def test_tunnel_route_uses_hostname_without_port(self):
        env = {
            **VALID,
            "QJUDGE_PUBLIC_ORIGIN": "https://judge.example.edu:8443",
            "COMPOSE_PROFILES": "tunnel",
            "TUNNEL_TOKEN": "t",
        }
        text = render_ingress(env)
        self.assertIn("route judge.example.edu -> http://frontend:80", text)
        self.assertIn("curl -H 'Host: judge.example.edu:8443'", text)

    def test_nginx_server_block(self):
        text = render_nginx({**VALID, "FRONTEND_BIND_ADDRESS": "10.0.0.5"})
        self.assertIn("server_name judge.example.edu;", text)
        self.assertIn("proxy_pass http://10.0.0.5:8080;", text)
        self.assertIn("proxy_set_header X-Forwarded-Proto $scheme;", text)
        self.assertIn("proxy_buffering off;", text)

    def test_bundled_media_entry_lists_proxy_routes_and_node_ports(self):
        env = {
            **VALID,
            "MEDIA_MODE": "bundled",
            "LIVEKIT_PUBLIC_URL": "wss://live.example.edu",
            "LIVEKIT_TURN_HOST": "turn.example.edu",
            "LIVEKIT_NODE_IP": "192.0.2.10",
            "FRONTEND_BIND_ADDRESS": "10.0.0.5",
        }

        lines = render_ingress(env).splitlines()

        self.assertIn("LiveKit  wss://live.example.edu", lines)
        self.assertIn("  Reverse proxy -> http://10.0.0.5:7880 (LiveKit HTTP/WebSocket signaling)", lines)
        self.assertIn("TURN  turn.example.edu", lines)
        turn_route = next(line for line in lines if "TLS termination" in line)
        self.assertIn("443 -> tcp 10.0.0.5:5349", turn_route)
        node_ports = next(line for line in lines if "Open directly on 192.0.2.10" in line)
        for port in ("TCP 7881", "UDP 50000-50099", "UDP 3478", "UDP 50300-50399"):
            self.assertIn(port, node_ports)

    def test_tunnel_routes_bundled_media_hostname_to_livekit(self):
        env = {
            **VALID,
            "MEDIA_MODE": "bundled",
            "LIVEKIT_PUBLIC_URL": "wss://live.example.edu",
            "COMPOSE_PROFILES": "tunnel",
        }

        text = render_ingress(env)

        self.assertIn("route live.example.edu -> http://livekit:7880", text)

    def test_nginx_includes_websocket_proxy_for_bundled_media(self):
        env = {
            **VALID,
            "MEDIA_MODE": "bundled",
            "LIVEKIT_PUBLIC_URL": "wss://live.example.edu",
        }

        text = render_nginx(env)

        self.assertIn("server_name live.example.edu;", text)
        self.assertIn("proxy_pass http://127.0.0.1:7880;", text)
        self.assertIn("proxy_set_header Upgrade $http_upgrade;", text)
        self.assertIn('proxy_set_header Connection "upgrade";', text)

    def test_nginx_terminates_turn_tls_to_livekit_tcp_port(self):
        env = {
            **VALID,
            "MEDIA_MODE": "bundled",
            "LIVEKIT_PUBLIC_URL": "wss://live.example.edu",
            "LIVEKIT_TURN_HOST": "turn.example.edu",
        }

        stream = render_nginx(env).split("stream {", 1)[1]

        self.assertIn(":443 ssl;", stream)
        self.assertIn("proxy_pass 127.0.0.1:5349;", stream)
        self.assertNotIn("server_name", stream)

    def test_external_and_disabled_media_omit_bundled_ingress(self):
        external = {
            **VALID,
            "MEDIA_MODE": "external",
            "LIVEKIT_PUBLIC_URL": "wss://live.example.edu",
            "LIVEKIT_TURN_HOST": "turn.example.edu",
            "COMPOSE_PROFILES": "tunnel",
        }
        disabled = {
            **VALID,
            "MEDIA_MODE": "disabled",
            "LIVEKIT_TURN_HOST": "turn.example.edu",
            "COMPOSE_PROFILES": "tunnel",
        }

        for env in (external, disabled):
            with self.subTest(media_mode=env["MEDIA_MODE"]):
                ingress = render_ingress(env)
                nginx = render_nginx(env)
                for bundled_marker in (
                    "live.example.edu",
                    "7880",
                    "7881",
                    "50000-50099",
                    "3478",
                    "50300-50399",
                    "5349",
                    "turn.example.edu",
                ):
                    self.assertNotIn(bundled_marker, ingress)
                    self.assertNotIn(bundled_marker, nginx)


if __name__ == "__main__":
    unittest.main()
