import unittest

from qjudge_cli.ingress import ingress_entries, render_ingress, render_nginx
from qjudge_cli.tests.test_check import VALID


class IngressTests(unittest.TestCase):
    def test_default_bundled_storage_uses_only_main_ingress(self):
        env = {**VALID, "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": "", "COMPOSE_PROFILES": "tunnel"}
        text = render_ingress(env)
        self.assertIn("Storage  https://judge.example.edu/qjudge/", text)
        self.assertIn("no extra domain or tunnel route", text)
        self.assertEqual(text.count("  route "), 1)
        self.assertNotIn("-> http://minio", text)
        nginx = render_nginx(env)
        self.assertEqual(nginx.count("server {"), 1)
        self.assertIn("client_max_body_size 0;", nginx)
        self.assertIn("proxy_request_buffering off;", nginx)
        self.assertIn("proxy_set_header Host $http_host;", nginx)

    def test_explicit_main_origin_does_not_duplicate_server_or_tunnel_route(self):
        env = {**VALID, "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": VALID["QJUDGE_PUBLIC_ORIGIN"],
               "COMPOSE_PROFILES": "tunnel"}
        self.assertEqual(render_nginx(env).count("server {"), 1)
        self.assertEqual(render_ingress(env).count("  route "), 1)

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
        self.assertIn('proxy_set_header Connection $qjudge_upgrade_connection;', text)

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

    def test_site_and_mcp_entries_always_exist(self):
        entries = {e.id: e for e in ingress_entries({**VALID, "STORAGE_MODE": "external"})}
        self.assertEqual(list(entries), ["site", "mcp"])
        self.assertEqual(entries["site"].probe, "https://judge.example.edu/api/health/")
        self.assertEqual(entries["site"].expect, "200")
        self.assertEqual(entries["site"].target, "http://127.0.0.1:8080")
        self.assertEqual((entries["mcp"].probe, entries["mcp"].expect), ("https://judge.example.edu/mcp", "401"))

    def test_same_origin_storage_is_probed_through_the_bucket_path(self):
        entries = {e.id: e for e in ingress_entries({**VALID, "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": ""})}
        self.assertEqual(entries["storage"].public, "https://judge.example.edu/qjudge/")
        self.assertEqual(entries["storage"].expect, "reachable")

    def test_storage_domain_probes_minio_health(self):
        entry = next(e for e in ingress_entries(VALID) if e.id == "storage")
        self.assertEqual(entry.probe, "https://files.example.edu/minio/health/live")
        self.assertEqual(entry.target, "http://127.0.0.1:9000")

    def test_bundled_media_adds_media_and_turn(self):
        env = {**VALID, "MEDIA_MODE": "bundled", "LIVEKIT_PUBLIC_URL": "wss://live.example.edu",
               "LIVEKIT_TURN_HOST": "turn.example.edu", "LIVEKIT_NODE_IP": "192.0.2.10"}
        entries = {e.id: e for e in ingress_entries(env)}
        self.assertEqual(entries["media"].probe, "https://live.example.edu")
        self.assertEqual((entries["turn"].probe, entries["turn"].expect), ("turn.example.edu:443", "tcp"))

    def test_tunnel_entries_target_the_tunnel_routes(self):
        bundled = {**VALID, "MEDIA_MODE": "bundled", "LIVEKIT_PUBLIC_URL": "wss://live.example.edu",
                   "LIVEKIT_TURN_HOST": "turn.example.edu", "COMPOSE_PROFILES": "postal, tunnel"}
        targets = {e.id: e.target for e in ingress_entries(bundled)}
        self.assertEqual(targets, {
            "site": "http://frontend:80",
            "mcp": "http://frontend:80",
            "storage": "http://minio:9000",
            "media": "http://livekit:7880",
            # Cloudflare Tunnel has no route for TURN; the proxy host still terminates it.
            "turn": "tcp 127.0.0.1:5349",
        })
        text = render_ingress(bundled)
        for target in ("http://frontend:80", "http://minio:9000", "http://livekit:7880"):
            self.assertIn(f"-> {target}", text)

    def test_tunnel_entries_on_the_main_origin_target_the_frontend_route(self):
        env = {**VALID, "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": "", "MEDIA_MODE": "bundled",
               "LIVEKIT_PUBLIC_URL": "", "LIVEKIT_TURN_HOST": "turn.example.edu", "COMPOSE_PROFILES": "tunnel"}
        targets = {e.id: e.target for e in ingress_entries(env)}
        self.assertEqual(targets["storage"], "http://frontend:80")
        self.assertEqual(targets["media"], "http://frontend:80")

    def test_external_media_is_listed_without_turn(self):
        env = {**VALID, "MEDIA_MODE": "external", "LIVEKIT_PUBLIC_URL": "wss://live.example.edu/",
               "LIVEKIT_TURN_HOST": "turn.example.edu", "COMPOSE_PROFILES": "tunnel"}
        entries = {e.id: e for e in ingress_entries(env)}
        self.assertNotIn("turn", entries)
        media = entries["media"]
        self.assertEqual(
            (media.public, media.target, media.probe, media.expect),
            ("wss://live.example.edu", "external (existing LiveKit)", "https://live.example.edu", "reachable"),
        )


if __name__ == "__main__":
    unittest.main()
