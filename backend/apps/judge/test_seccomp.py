"""Docker SDK seccomp boundary tests; no Docker daemon or database required."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import Mock

from django.test import override_settings

from .io_judge import IOJudge


class JudgeSeccompTests(TestCase):
    def test_sdk_receives_profile_json_for_absolute_and_relative_paths(self):
        profile = {
            "defaultAction": "SCMP_ACT_ERRNO",
            "syscalls": [{"names": ["read", "write"], "action": "SCMP_ACT_ALLOW"}],
        }
        with TemporaryDirectory() as directory:
            path = Path(directory) / "profile.json"
            path.write_text(json.dumps(profile, indent=2), encoding="utf-8")
            for configured_path in (str(path), path.name):
                with self.subTest(configured_path=configured_path), override_settings(
                    BASE_DIR=directory, DOCKER_SECCOMP_PROFILE=configured_path,
                ):
                    judge = IOJudge("cpp")
                    judge._client = Mock()
                    container = judge._start_container(128)
                    options = judge._client.containers.create.call_args.kwargs["security_opt"]
                    self.assertIn("no-new-privileges", options)
                    payload, = [value.partition("=")[2] for value in options if value.startswith("seccomp=")]
                    self.assertEqual(json.loads(payload), profile)
                    container.start.assert_called_once_with()

    @override_settings(DOCKER_SECCOMP_PROFILE=None)
    def test_no_custom_profile_keeps_no_new_privileges(self):
        judge = IOJudge("python")
        judge._client = Mock()
        judge._start_container(128)
        self.assertEqual(
            judge._client.containers.create.call_args.kwargs["security_opt"],
            ["no-new-privileges"],
        )
