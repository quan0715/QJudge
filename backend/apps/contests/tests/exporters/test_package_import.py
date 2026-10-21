"""Import-order regression tests for the contest exporters package."""

import os
import subprocess
import sys
from pathlib import Path

from django.conf import settings

BACKEND_ROOT = Path(__file__).resolve().parents[4]


def test_exporters_import_first_in_fresh_process():
    """A process that imports exporters before contest services must not hit an import cycle."""
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import django; django.setup(); import apps.contests.exporters",
        ],
        cwd=BACKEND_ROOT,
        env={**os.environ, "DJANGO_SETTINGS_MODULE": settings.SETTINGS_MODULE},
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
