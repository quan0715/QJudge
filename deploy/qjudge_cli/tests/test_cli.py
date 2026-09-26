import io
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from qjudge_cli.cli import main
from qjudge_cli.tests.test_check import VALID


def write_env(directory: str, values: dict[str, str]) -> Path:
    path = Path(directory) / ".env"
    path.write_text("".join(f"{key}={value}\n" for key, value in values.items()))
    return path


class CliTests(unittest.TestCase):
    def run_cli(self, *args):
        output = io.StringIO()
        with redirect_stdout(output):
            code = main(list(args))
        return code, output.getvalue()

    def test_check_passes_for_valid_env(self):
        with tempfile.TemporaryDirectory() as directory:
            path = write_env(directory, VALID)
            code, output = self.run_cli("check", "--env-file", str(path))
        self.assertEqual(code, 0)
        self.assertIn("OK", output)

    def test_check_fails_and_lists_problems(self):
        with tempfile.TemporaryDirectory() as directory:
            path = write_env(directory, {**VALID, "SECRET_KEY": ""})
            code, output = self.run_cli("check", "--env-file", str(path))
        self.assertEqual(code, 1)
        self.assertIn("SECRET_KEY: required", output)

    def test_check_fails_when_env_file_is_missing(self):
        code, _ = self.run_cli("check", "--env-file", "/nonexistent/.env")
        self.assertEqual(code, 1)

    def test_init_non_interactive_lists_missing_keys_without_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            code, output = self.run_cli(
                "init", "--env-file", str(env_file), "--non-interactive",
                "--set", "QJUDGE_PUBLIC_ORIGIN=https://judge.example.edu",
            )
            self.assertFalse(env_file.exists())
        self.assertEqual(code, 1)
        self.assertIn("STORAGE_MODE: required", output)

    def test_init_rejects_set_without_equals(self):
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as raised:
            main(["init", "--non-interactive", "--set", "STORAGE_MODE"])
        self.assertEqual(raised.exception.code, 2)

    def test_env_example_prints_rendered_example(self):
        code, output = self.run_cli("env-example")
        self.assertEqual(code, 0)
        self.assertIn("QJUDGE_PUBLIC_ORIGIN=", output)

    def test_lint_compose_reports_problems(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "compose.yml"
            path.write_text("A: ${UNKNOWN_KEY}\n")
            code, output = self.run_cli("lint-compose", str(path))
        self.assertEqual(code, 1)
        self.assertIn("UNKNOWN_KEY", output)


if __name__ == "__main__":
    unittest.main()
