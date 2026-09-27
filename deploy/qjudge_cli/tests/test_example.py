import unittest
from pathlib import Path

from qjudge_cli.envfile import parse
from qjudge_cli.example import render
from qjudge_cli.schema import KEYS

EXAMPLE_PATH = Path(__file__).resolve().parents[2] / ".env.example"


class ExampleTests(unittest.TestCase):
    def test_lists_every_key(self):
        text = render()
        for key in KEYS:
            self.assertIn(f"{key.name}=", text)

    def test_only_always_required_keys_are_uncommented(self):
        active = set(parse(render()))
        expected = {key.name for key in KEYS if key.required is True}
        self.assertEqual(active, expected)

    def test_committed_example_matches_schema(self):
        self.assertEqual(
            EXAMPLE_PATH.read_text(encoding="utf-8"),
            render(),
            "deploy/.env.example is stale; run: deploy/qjudge env-example > deploy/.env.example",
        )


if __name__ == "__main__":
    unittest.main()
