"""The Jules bootstrap must preserve pre-existing Dockerfile edits on exit."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "setup-jules-env.sh"
DOCKERFILES = (
    "backend/Dockerfile", "backend/judge/Dockerfile.judge", "frontend/Dockerfile.dev",
    "ai-service/Dockerfile", "integrity-service/Dockerfile.resident", "mcp-server/Dockerfile",
)


class BootstrapRestoreTests(unittest.TestCase):
    def test_failed_build_preserves_local_dockerfile_edits(self):
        self.run_bootstrap(fail_build=True)

    def test_later_failure_after_successful_build_preserves_local_edits(self):
        self.run_bootstrap(fail_build=False)

    def test_missing_judge_image_fallback_uses_legacy_compatible_dockerfile(self):
        self.run_bootstrap(fail_build=False, missing_image=True)

    def run_bootstrap(self, *, fail_build, missing_image=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            script = root / "scripts/dev/setup-jules-env.sh"
            script.parent.mkdir(parents=True)
            script.write_bytes(SCRIPT.read_bytes())
            originals = {}
            for name in DOCKERFILES:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                originals[name] = f"FROM local-edit\n# Keep my changes to {name}\n".encode()
                if name == "backend/judge/Dockerfile.judge":
                    originals[name] += b"RUN --mount=type=cache,target=/cache echo build\n"
                path.write_bytes(originals[name])
            (root / "deploy").mkdir()
            (root / "deploy/.env").touch()
            (root / "frontend/node_modules").mkdir()
            bin_dir = root / "bin"
            bin_dir.mkdir()
            commands = {
                "bin/docker": """
if [ "$JULES_TEST_MISSING_IMAGE" = 1 ]; then
  if [ "$1" = image ] || [ "$1" = pull ]; then exit 1; fi
  if [ "$1" = build ] && [ "$3" = ghcr.io/quan0715/qjudge/judge:latest ]; then
    if grep -q -- '--mount' backend/judge/Dockerfile.judge; then exit 31; fi
  fi
fi
if [ "$JULES_TEST_FAIL_BUILD" = 1 ] && [ "$1" = build ] && [ "$3" = qjudge/backend:dev ]; then exit 17; fi
exit 0""",
                "bin/uname": "echo Darwin",
                "deploy/qjudge": "exit 0",
                ".codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh": "exit 29",
            }
            for name, body in commands.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("#!/bin/sh\n" + body + "\n")
                path.chmod(0o755)
            result = subprocess.run(
                ["bash", str(script), "--skip-seed"], capture_output=True, text=True,
                env={**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}",
                     "JULES_TEST_FAIL_BUILD": "1" if fail_build else "0",
                     "JULES_TEST_MISSING_IMAGE": "1" if missing_image else "0"},
            )
            self.assertEqual(result.returncode, 17 if fail_build else 29, result.stdout + result.stderr)
            for name, expected in originals.items():
                self.assertEqual((root / name).read_bytes(), expected, name)


if __name__ == "__main__":
    unittest.main()
