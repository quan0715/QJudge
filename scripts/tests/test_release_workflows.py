from __future__ import annotations

from pathlib import Path

import yaml


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


def _workflow(name: str) -> dict:
    return yaml.load(
        (REPOSITORY_ROOT / ".github" / "workflows" / name).read_text(),
        Loader=yaml.BaseLoader,
    )


def test_production_deploy_requires_an_explicit_main_branch_confirmation() -> None:
    workflow = _workflow("cd-prod.yml")

    assert set(workflow["on"]) == {"workflow_dispatch"}
    confirmation = workflow["on"]["workflow_dispatch"]["inputs"][
        "confirm_production"
    ]
    assert confirmation["type"] == "boolean"
    assert confirmation["required"] == "true"
    assert confirmation["default"] == "false"

    deploy = workflow["jobs"]["deploy"]
    assert deploy["environment"] == "production"
    assert "github.ref == 'refs/heads/main'" in deploy["if"]
    assert "inputs.confirm_production" in deploy["if"]
    assert workflow["concurrency"]["cancel-in-progress"] == "false"

    deploy_step = next(
        step for step in deploy["steps"] if step.get("name") == "Deploy on server"
    )
    assert "if" not in deploy_step
    # Required checks on release pull requests gate main, so CD deploys the
    # selected commit without waiting for another CI run.
    assert all("gh run" not in step.get("run", "") for step in deploy["steps"])
    assert deploy["permissions"] == {"contents": "read"}


def test_ci_runs_on_pull_requests_to_main_but_not_on_pushes_to_main() -> None:
    triggers = _workflow("ci.yml")["on"]

    assert "main" in triggers["pull_request"]["branches"]
    assert triggers["push"]["branches"] == ["dev"]


def test_mcp_ci_jobs_respect_the_server_major_version_constraint() -> None:
    workflow = _workflow("ci.yml")

    install_steps = [
        step
        for job in workflow["jobs"].values()
        for step in job.get("steps", [])
        if step.get("name") == "Install MCP Server dependencies"
    ]

    assert len(install_steps) == 2
    for step in install_steps:
        assert step["working-directory"] == "mcp-server"
        assert '"mcp[cli]>=1.9.0,<2.0"' in step["run"]
