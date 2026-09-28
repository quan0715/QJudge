import unittest

from qjudge_cli.lint import lint_compose_text


class LintTests(unittest.TestCase):
    def test_minio_data_dir_may_default_to_a_volume(self):
        self.assertEqual(lint_compose_text("      - ${MINIO_DATA_DIR:-minio-data}:/data\n"), [])

    def test_schema_keys_and_empty_defaults_pass(self):
        text = "A: ${SECRET_KEY}\nB: ${QJUDGE_TRUSTED_PROXIES:-}\n"
        self.assertEqual(lint_compose_text(text), [])

    def test_unknown_variable_is_reported(self):
        self.assertEqual(
            lint_compose_text("A: ${ANTICHEAT_RAW_BUCKET:-}\n"),
            ["line 1: ANTICHEAT_RAW_BUCKET is not in the schema"],
        )

    def test_non_empty_default_is_reported(self):
        self.assertEqual(
            lint_compose_text("A: ${MEDIA_MODE:-disabled}\n"),
            ["line 1: MEDIA_MODE must not have a default in compose; defaults belong to the app"],
        )

    def test_topology_defaults_are_allowed(self):
        text = 'ports: ["${FRONTEND_BIND_ADDRESS:-127.0.0.1}:${FRONTEND_PORT:-8080}:80"]\nname: ${COMPOSE_PROJECT_NAME:-qjudge}\n'
        self.assertEqual(lint_compose_text(text), [])

    def test_internal_variables_are_allowed(self):
        self.assertEqual(lint_compose_text("image: qjudge/backend:${QJUDGE_VERSION}\n"), [])

    def test_escaped_dollar_is_ignored(self):
        self.assertEqual(lint_compose_text("cmd: echo $${HOME}\n"), [])

    def test_comments_are_ignored(self):
        self.assertEqual(lint_compose_text("# uses ${UNKNOWN_KEY}\n"), [])


if __name__ == "__main__":
    unittest.main()
