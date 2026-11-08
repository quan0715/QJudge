"""Exercise the fresh-install shell flow without starting Docker or a database."""
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SHA = "b" * 40


class E2EStackTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="qjudge-stack-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "ci").mkdir()
        (self.root / "deploy").mkdir()
        self.bin = self.root / "bin"
        self.bin.mkdir()
        shutil.copyfile(ROOT / "ci/e2e-stack.sh", self.root / "ci/e2e-stack.sh")
        self._script(self.root / "deploy/qjudge", '''#!/bin/sh
set -eu
case "$1" in
  init) printf 'COMPOSE_PROJECT_NAME=diagnostic-stack\nFRONTEND_PORT=18080\nSTORAGE_MODE=bundled\n' > deploy/.env ;;
  upgrade)
    if [ "${FAIL_UPGRADE:-}" = 1 ]; then exit 42; fi
    printf 'current=%s\n' "$TEST_SHA" > deploy/.version ;;
esac
''')
        self._script(self.bin / "git", '#!/bin/sh\nprintf "%s\\n" "$TEST_SHA"\n')
        self._script(self.bin / "curl", '#!/bin/sh\nexit 0\n')
        self._script(self.bin / "docker", '#!/bin/sh\nprintf "%s\\n" "$*" >> "$DOCKER_CALLS"\n')
        self.github_env = self.root / "github-env"
        self.calls = self.root / "docker-calls"

    def _script(self, path, content):
        path.write_text(content)
        path.chmod(0o755)

    def run_stack(self, fail=False):
        return subprocess.run(["bash", "ci/e2e-stack.sh"], cwd=self.root, capture_output=True, text=True,
                              env={**os.environ, "PATH": f"{self.bin}:{os.environ['PATH']}",
                                   "TEST_SHA": SHA, "FAIL_UPGRADE": "1" if fail else "0",
                                   "GITHUB_ENV": str(self.github_env), "DOCKER_CALLS": str(self.calls)})

    def test_failed_upgrade_exports_production_stack_for_failure_diagnostics(self):
        result = self.run_stack(fail=True)
        self.assertEqual(result.returncode, 42, result.stderr)
        self.assertTrue(self.github_env.exists(), "failed installation must still expose its diagnostic command")
        command = self.github_env.read_text()
        self.assertIn(f"QJUDGE_VERSION=sha-{SHA[:12]}", command)
        self.assertIn("--project-name diagnostic-stack", command)
        self.assertIn("deploy/compose.yml", command)
        self.assertNotIn("compose.e2e.yml", command)
        self.assertFalse(self.calls.exists(), "do not seed or apply E2E overrides after a failed upgrade")

    def test_success_switches_export_to_e2e_stack_before_seeding(self):
        result = self.run_stack()
        self.assertEqual(result.returncode, 0, result.stderr)
        commands = self.github_env.read_text().splitlines()
        self.assertEqual(len(commands), 2)
        self.assertNotIn("compose.e2e.yml", commands[0])
        self.assertIn("compose.e2e.yml", commands[1])
        self.assertIn(f"QJUDGE_VERSION=sha-{SHA[:12]}", commands[1])
        calls = self.calls.read_text().splitlines()
        self.assertIn("compose.e2e.yml", calls[-1])
        self.assertIn("exec -T backend python manage.py seed_e2e_data", calls[-1])
