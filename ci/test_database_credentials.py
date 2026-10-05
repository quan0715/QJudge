"""Verify the installed stack's database roles from the running AI service."""
from __future__ import annotations

import os
import unittest
from urllib.parse import unquote, urlsplit

import psycopg


class DatabaseCredentialTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ai_url = os.environ["AI_DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://", 1)
        cls.web_url = os.environ["DJANGO_DATABASE_URL"]

    def test_ai_cannot_connect_to_web_database(self):
        with self.assertRaises(psycopg.OperationalError):
            with psycopg.connect(self.ai_url, host="postgres", dbname="online_judge", connect_timeout=3):
                pass

    def test_web_cannot_connect_to_ai_database(self):
        with self.assertRaises(psycopg.OperationalError):
            with psycopg.connect(self.web_url, host="postgres", dbname="qjudge_ai", connect_timeout=3):
                pass

    def test_ai_can_connect_to_own_database(self):
        with psycopg.connect(self.ai_url, host="postgres", connect_timeout=3) as connection:
            self.assertEqual(connection.execute("SELECT current_user, current_database()").fetchone(),
                             ("qjudge_ai", "qjudge_ai"))

    def test_web_can_connect_to_own_database(self):
        with psycopg.connect(self.web_url, host="postgres", connect_timeout=3) as connection:
            self.assertEqual(connection.execute("SELECT current_user, current_database()").fetchone(),
                             ("qjudge_web", "online_judge"))

    def test_live_ai_connection_uses_declared_role_and_database(self):
        parsed = urlsplit(self.ai_url)
        self.assertEqual(unquote(parsed.username or ""), "qjudge_ai")
        self.assertEqual(unquote(parsed.path.lstrip("/")), "qjudge_ai")
        with psycopg.connect(self.ai_url, connect_timeout=3) as connection:
            self.assertEqual(connection.execute("SELECT current_user, current_database()").fetchone(),
                             ("qjudge_ai", "qjudge_ai"))


if __name__ == "__main__":
    unittest.main()
