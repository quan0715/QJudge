import importlib.util
import os
import stat
from pathlib import Path


def _load_bootstrap_module():
    script_path = Path(__file__).resolve().parents[1] / "bootstrap_ai_oauth_keys.py"
    spec = importlib.util.spec_from_file_location(
        "bootstrap_ai_oauth_keys", script_path
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_private_key_has_mode_0600_before_permission_enforcement(
    tmp_path, monkeypatch
):
    module = _load_bootstrap_module()
    private_path = tmp_path / "private.pem"
    public_path = tmp_path / "public.pem"
    real_chmod = os.chmod

    def assert_private_key_already_secure(path, mode):
        if Path(path) == private_path:
            assert stat.S_IMODE(private_path.stat().st_mode) == 0o600
        real_chmod(path, mode)

    monkeypatch.setattr(module.os, "chmod", assert_private_key_already_secure)
    previous_umask = os.umask(0o022)
    try:
        module.bootstrap(private_path, public_path)
    finally:
        os.umask(previous_umask)

    assert stat.S_IMODE(private_path.stat().st_mode) == 0o600
