import unittest

from qjudge_cli.ingress import render_ingress, render_nginx
from qjudge_cli.tests.test_check import VALID


class IngressTests(unittest.TestCase):
    def test_bundled_storage_entry(self):
        text = render_ingress(VALID)
        self.assertIn("Storage  https://files.example.edu", text)
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
        self.assertIn("curl -H 'Host: judge.example.edu' http://127.0.0.1:8080/api/health/", text)
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


if __name__ == "__main__":
    unittest.main()
