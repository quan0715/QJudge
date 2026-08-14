from pathlib import Path

import yaml


def test_dev_frontend_proxies_api_requests_to_backend_service() -> None:
    compose = yaml.safe_load(
        (Path(__file__).resolve().parents[2] / "docker-compose.dev.yml").read_text()
    )

    assert "VITE_API_TARGET=http://backend:8000" in compose["services"]["frontend"][
        "environment"
    ]


def test_dev_bootstraps_oauth_key_before_starting_backend() -> None:
    compose = yaml.safe_load(
        (Path(__file__).resolve().parents[2] / "docker-compose.dev.yml").read_text()
    )

    bootstrap = compose["services"]["ai-oauth-bootstrap"]
    backend = compose["services"]["backend"]

    assert "./secrets:/oauth-secrets" in bootstrap["volumes"]
    assert "./secrets:/run-secrets:ro" in backend["volumes"]
    assert backend["depends_on"]["ai-oauth-bootstrap"]["condition"] == (
        "service_completed_successfully"
    )


def test_dev_mcp_verifies_resource_tokens_against_local_backend_jwks() -> None:
    compose = yaml.safe_load(
        (Path(__file__).resolve().parents[2] / "docker-compose.dev.yml").read_text()
    )

    assert "OAUTH_JWKS_URL=http://backend:8000/.well-known/jwks.json" in compose[
        "services"
    ]["qjudge-mcp"]["environment"]
