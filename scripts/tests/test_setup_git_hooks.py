"""Verify the installed hook checks the checkout being pushed."""

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


INSTALLER = Path(__file__).resolve().parents[1] / "setup-git-hooks.sh"


class GitHooksTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="qjudge hooks ")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "repo"
        self.root.mkdir()
        self.run_command("git", "init", "-b", "main")
        scripts = self.root / "scripts"
        scripts.mkdir()
        shutil.copyfile(INSTALLER, scripts / INSTALLER.name)
        (scripts / "pre-push-check.sh").write_text("#!/bin/sh\npwd\n")
        self.run_command("git", "add", "scripts")
        self.run_command(
            "git", "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
            "-c", "core.hooksPath=/dev/null", "commit", "-m", "fixture",
        )

    def run_command(self, *args, cwd=None):
        return subprocess.run(
            args, cwd=cwd or self.root, text=True, capture_output=True, check=True,
        ).stdout.strip()

    def install_and_run(self, checkout):
        self.run_command("bash", "scripts/setup-git-hooks.sh", cwd=checkout)
        hook = Path(self.run_command(
            "git", "rev-parse", "--path-format=absolute", "--git-path", "hooks/pre-push",
            cwd=checkout,
        ))
        self.assertTrue(hook.is_file())
        self.assertEqual(
            Path(self.run_command(str(hook), cwd=checkout)).resolve(),
            checkout.resolve(),
        )

    def test_main_checkout(self):
        self.install_and_run(self.root)

    def test_linked_worktree_uses_its_own_check_script(self):
        linked = Path(self.temp.name) / "linked checkout"
        self.run_command("git", "worktree", "add", "-b", "feature", str(linked))
        # Fail visibly if the shared hook accidentally runs the main checkout's script.
        (self.root / "scripts/pre-push-check.sh").write_text("#!/bin/sh\nexit 99\n")
        self.install_and_run(linked)

    def test_custom_hooks_path(self):
        self.run_command("git", "config", "core.hooksPath", "custom hooks")
        self.install_and_run(self.root)
        self.assertTrue((self.root / "custom hooks/pre-push").is_file())


if __name__ == "__main__":
    unittest.main()
