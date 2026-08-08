import tomllib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MCP_REQUIREMENT = "mcp[cli]>=1.9.0,<2.0"


def test_mcp_runtime_and_package_metadata_pin_the_same_major_version() -> None:
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text())
    dependencies = pyproject["project"]["dependencies"]

    assert MCP_REQUIREMENT in dependencies
    assert MCP_REQUIREMENT in (ROOT / "Dockerfile").read_text()
