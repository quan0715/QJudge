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
    verify_ci_step = next(
        step
        for step in deploy["steps"]
        if step.get("name") == "Verify release CI"
    )
    assert "gh run list" in verify_ci_step["run"]
    assert "conclusion" in verify_ci_step["run"]
    assert deploy["permissions"]["actions"] == "read"


def test_ci_compose_check_uses_a_populated_ci_environment() -> None:
    workflow = _workflow("ci.yml")
    static_steps = workflow["jobs"]["static-checks"]["steps"]
    compose_step = next(
        step
        for step in static_steps
        if step.get("name") == "Deployment Compose Config Check"
    )
    command = compose_step["run"]

    assert "bash scripts/check-compose-config.sh" in command

    compose_check = (
        REPOSITORY_ROOT / "scripts" / "check-compose-config.sh"
    ).read_text()

    for key in (
        "QJUDGE_PUBLIC_ORIGIN",
        "SECRET_KEY",
        "POSTGRES_ADMIN_PASSWORD",
        "DB_PASSWORD",
        "AI_DB_PASSWORD",
        "CREDENTIAL_LEASE_SECRET",
        "DOCKER_GID",
        "DOCKER_SOCKET_UID",
        "OBJECT_STORAGE_ENDPOINT_URL",
        "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL",
        "OBJECT_STORAGE_ACCESS_KEY",
        "OBJECT_STORAGE_SECRET_KEY",
        "LOADTEST_OBJECT_STORAGE_ENDPOINT_URL",
        "LOADTEST_OBJECT_STORAGE_PUBLIC_ENDPOINT_URL",
        "LOADTEST_OBJECT_STORAGE_ACCESS_KEY",
        "LOADTEST_OBJECT_STORAGE_SECRET_KEY",
        "LOADTEST_ANTICHEAT_RAW_BUCKET",
    ):
        assert f"{key}=" in compose_check
    assert "--env-file" in compose_check
    assert ".env.example" in compose_check


def test_local_pre_push_uses_the_same_compose_config_gate_as_ci() -> None:
    pre_push = (REPOSITORY_ROOT / "scripts" / "pre-push-check.sh").read_text()

    assert "bash scripts/check-compose-config.sh" in pre_push
    assert "docker compose config -q" not in pre_push


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


def test_workflows_use_node24_action_runtimes_without_force_flag() -> None:
    workflow_directory = REPOSITORY_ROOT / ".github" / "workflows"
    workflow_text = "\n".join(
        path.read_text() for path in sorted(workflow_directory.glob("*.yml"))
    )

    assert "actions/checkout@v4" not in workflow_text
    assert "actions/setup-node@v4" not in workflow_text
    assert "actions/setup-python@v5" not in workflow_text
    assert "actions/upload-artifact@v4" not in workflow_text
    assert "docker/login-action@v3" not in workflow_text
    assert "docker/setup-buildx-action@v3" not in workflow_text
    assert "docker/build-push-action@v5" not in workflow_text
    assert "FORCE_JAVASCRIPT_ACTIONS_TO_NODE24" not in workflow_text
