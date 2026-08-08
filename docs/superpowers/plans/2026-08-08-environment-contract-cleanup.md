# Environment Contract Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce QJudge's user-managed deployment environment from 94 mixed settings to one minimal `.env.example`, generated internal secrets, and conditionally validated external integrations.

**Architecture:** `docker-compose.yml` and service settings own fixed runtime wiring and safe defaults. A new `scripts/setup-env.sh` creates the one active `.env` atomically from a public origin plus external object-storage credentials; `scripts/deploy-prod.sh` remains the CD wrapper but validates only the minimal contract and enabled profiles.

**Tech Stack:** Bash 3.2-compatible shell, Docker Compose v2, Python 3.11 standard library, pytest 8, PyYAML, Django settings.

## Global Constraints

- Keep exactly one root deployment template: `.env.example`.
- Each machine has exactly one active `.env`, which remains ignored by Git.
- Do not add MinIO, EC2, HTTPS, OAuth deployment documentation, or secret-manager integrations in this plan.
- Do not delete application features while removing settings from the root env contract.
- Never print generated or supplied secret values.
- Do not require Tunnel, third-party OAuth, SMTP, Cloudflare Realtime, or cloud AI credentials for minimum Compose validation.
- Generate URL-safe database passwords so the Compose-built `AI_DATABASE_URL` remains valid.
- Preserve unrelated working-tree changes and the untracked `.deepagents` files.

---

### Task 1: Lock the minimal environment contract with failing tests

**Files:**
- Create: `ai-service/tests/contract/test_setup_env.py`
- Modify: `ai-service/tests/contract/test_compose_boundaries.py`

**Interfaces:**
- Consumes: the approved variable disposition in `docs/superpowers/specs/2026-08-08-environment-contract-cleanup-design.md`.
- Produces: `_minimal_production_env()` using `QJUDGE_PUBLIC_ORIGIN`, fixed database identities, generated-secret fields, and four object-storage fields; contract assertions used by later tasks.

- [ ] **Step 1: Replace the production fixture with the desired minimal input**

Use this fixture body in `test_compose_boundaries.py`:

```python
def _minimal_production_env() -> str:
    return textwrap.dedent(
        """\
        QJUDGE_PUBLIC_ORIGIN=https://qjudge.invalid
        SECRET_KEY=secure-production-secret
        POSTGRES_ADMIN_PASSWORD=secure-admin-password
        DB_PASSWORD=secure-web-password
        AI_DB_PASSWORD=secure-ai-password
        CREDENTIAL_LEASE_SECRET=secure-credential-lease-secret-long-enough
        OBJECT_STORAGE_ENDPOINT_URL=https://storage.invalid
        OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=https://storage.invalid
        OBJECT_STORAGE_ACCESS_KEY=secure-storage-key
        OBJECT_STORAGE_SECRET_KEY=secure-storage-secret
        """
    )
```

- [ ] **Step 2: Add contract tests for the one root example and default service set**

Create `test_setup_env.py` with exact active-key and forbidden-key assertions:

```python
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def _active_env_keys() -> set[str]:
    keys = set()
    for line in (REPOSITORY_ROOT / ".env.example").read_text().splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            keys.add(stripped.split("=", 1)[0])
    return keys


def test_root_env_example_exposes_only_minimum_deployment_inputs() -> None:
    assert _active_env_keys() == {
        "QJUDGE_PUBLIC_ORIGIN",
        "SECRET_KEY",
        "POSTGRES_ADMIN_PASSWORD",
        "DB_PASSWORD",
        "AI_DB_PASSWORD",
        "CREDENTIAL_LEASE_SECRET",
        "OBJECT_STORAGE_ENDPOINT_URL",
        "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL",
        "OBJECT_STORAGE_ACCESS_KEY",
        "OBJECT_STORAGE_SECRET_KEY",
    }


def test_root_env_example_excludes_internal_and_special_purpose_settings() -> None:
    forbidden = {
        "DJANGO_ENV", "DB_HOST", "REDIS_URL", "AI_DATABASE_URL",
        "AI_QUEUE_NAME", "DOCKER_GID", "TUNNEL_TOKEN",
        "LOADTEST_OBJECT_STORAGE_ENDPOINT_URL", "MCP_WIDGET_CLASSROOM_LIST_JS",
    }
    assert not forbidden & _active_env_keys()
```

Extend `test_default_production_compose_excludes_removed_integrations` to assert that `cloudflared` is absent without a profile. Add a second render with `--profile tunnel` and `TUNNEL_TOKEN=secure-tunnel-token` that asserts `cloudflared` is present.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
python3 -m pytest \
  ai-service/tests/contract/test_setup_env.py \
  ai-service/tests/contract/test_compose_boundaries.py -q
```

Expected: failures show the 94-key example, old required URL/database variables, and default `cloudflared` service.

- [ ] **Step 4: Commit the failing contracts**

```bash
git add ai-service/tests/contract/test_setup_env.py \
  ai-service/tests/contract/test_compose_boundaries.py
git commit -m "test: define minimal deployment env contract"
```

### Task 2: Move runtime wiring and defaults into Compose

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.dev.yml`
- Modify: `docker-compose.test.yml`
- Create: `backend/config/deployment.py`
- Create: `backend/apps/core/tests/test_public_origin_settings.py`
- Modify: `backend/config/settings/base.py`
- Modify: `backend/config/settings/prod.py`
- Modify: `ai-service/tests/contract/test_compose_boundaries.py`
- Modify: `ai-service/tests/integration/test_database_credentials.py`

**Interfaces:**
- Consumes: `QJUDGE_PUBLIC_ORIGIN`, five generated secrets, and four object-storage values.
- Produces: fixed role names `qjudge_admin`, `qjudge_web`, `qjudge_ai`; fixed database names `online_judge`, `qjudge_ai`; Compose-built `AI_DATABASE_URL`; profile-gated `cloudflared`.

- [ ] **Step 1: Add failing Compose-value assertions**

Add these behaviors to `test_compose_boundaries.py`:

```python
def test_production_compose_derives_public_runtime_values_from_one_origin() -> None:
    services = _rendered_compose(
        "docker-compose.yml",
        {"QJUDGE_PUBLIC_ORIGIN": "https://judge.example.test"},
    )["services"]
    backend = services["backend"]["environment"]
    assert backend["FRONTEND_URL"] == "https://judge.example.test"
    assert backend["OAUTH_ISSUER_URL"] == "https://judge.example.test"
    assert backend["CORS_ALLOWED_ORIGINS"] == "https://judge.example.test"
    assert backend["CSRF_TRUSTED_ORIGINS"] == "https://judge.example.test"


def test_production_compose_builds_ai_database_url_from_generated_password() -> None:
    services = _rendered_compose(
        "docker-compose.yml", {"AI_DB_PASSWORD": "UrlSafe123"}
    )["services"]
    for name in ("ai-migrate", "ai-service", "ai-worker"):
        assert services[name]["environment"]["AI_DATABASE_URL"] == (
            "postgresql+psycopg://qjudge_ai:UrlSafe123@postgres:5432/qjudge_ai"
        )
```

Update the test renderer so it substitutes `${NAME}` inside a larger string, not only expressions that occupy the complete value.

Add a pure settings helper contract:

```python
from config.deployment import parse_public_origin


def test_parse_public_origin_returns_normalized_origin_and_hostname() -> None:
    parsed = parse_public_origin("https://judge.example.test/")
    assert parsed.url == "https://judge.example.test"
    assert parsed.hostname == "judge.example.test"
```

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```bash
python3 -m pytest ai-service/tests/contract/test_compose_boundaries.py \
  -q -k 'public_runtime or builds_ai_database_url'
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test run --rm \
  backend-test pytest apps/core/tests/test_public_origin_settings.py -q
```

Expected: the old Compose still requires six public URL fields and a manually supplied `AI_DATABASE_URL`.

- [ ] **Step 3: Implement fixed identities and derived runtime values**

In main Compose:

```yaml
POSTGRES_USER: qjudge_admin
DB_NAME: online_judge
DB_USER: qjudge_web
AI_DB_NAME: qjudge_ai
AI_DB_USER: qjudge_ai
AI_DATABASE_URL: postgresql+psycopg://qjudge_ai:${AI_DB_PASSWORD:?AI_DB_PASSWORD is required}@postgres:5432/qjudge_ai
FRONTEND_URL: ${QJUDGE_PUBLIC_ORIGIN:?QJUDGE_PUBLIC_ORIGIN is required}
OAUTH_ISSUER_URL: ${QJUDGE_PUBLIC_ORIGIN:?QJUDGE_PUBLIC_ORIGIN is required}
CORS_ALLOWED_ORIGINS: ${QJUDGE_PUBLIC_ORIGIN:?QJUDGE_PUBLIC_ORIGIN is required}
CSRF_TRUSTED_ORIGINS: ${QJUDGE_PUBLIC_ORIGIN:?QJUDGE_PUBLIC_ORIGIN is required}
MARKDOWN_IMAGE_PUBLIC_BASE_URL: ${QJUDGE_PUBLIC_ORIGIN:?QJUDGE_PUBLIC_ORIGIN is required}
```

Create `backend/config/deployment.py` with this public interface:

```python
from dataclasses import dataclass
from urllib.parse import urlsplit


@dataclass(frozen=True)
class PublicOrigin:
    url: str
    hostname: str


def parse_public_origin(raw: str) -> PublicOrigin:
    value = raw.strip()
    try:
        parsed = urlsplit(value)
        parsed.port
    except ValueError as exc:
        raise ValueError("QJUDGE_PUBLIC_ORIGIN is not a valid origin") from exc
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        raise ValueError("QJUDGE_PUBLIC_ORIGIN must use http or https and include a host")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("QJUDGE_PUBLIC_ORIGIN must not include user information")
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise ValueError("QJUDGE_PUBLIC_ORIGIN must not include a path, query, or fragment")
    return PublicOrigin(
        url=f"{parsed.scheme.lower()}://{parsed.netloc}",
        hostname=parsed.hostname,
    )
```

The implementation accepts only `http`／`https`, requires a hostname, rejects userinfo,
query and fragment, permits only an empty path or `/`, and returns the origin without a
trailing slash. `base.py` uses its normalized URL for `FRONTEND_URL` and
`OAUTH_ISSUER_URL`; `prod.py` uses its hostname for `ALLOWED_HOSTS`. Explicit legacy
overrides remain available inside service settings for advanced use, but disappear from
the root deployment contract.

Keep internal service URLs, queue names, file paths, bucket names, TTLs, limits, regions, and object-storage behavior as literal version-controlled defaults. Give `cloudflared` `profiles: ["tunnel"]`, change its token interpolation to `${TUNNEL_TOKEN:-}`, and keep `qjudge-mcp` on the Docker network when no public MCP URL is supplied.

Apply the same fixed database identities and internal wiring to dev/test while preserving their ports, fake adapters, settings modules, and isolated database names where tests require isolation.

- [ ] **Step 4: Run focused Compose contracts and verify GREEN**

Run:

```bash
python3 -m pytest ai-service/tests/contract/test_compose_boundaries.py -q
docker compose -f docker-compose.test.yml config -q
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test run --rm \
  backend-test pytest apps/core/tests/test_public_origin_settings.py -q
```

Expected: all commands pass; default production services omit `cloudflared`.

- [ ] **Step 5: Commit the Compose boundary**

```bash
git add docker-compose.yml docker-compose.dev.yml docker-compose.test.yml \
  backend/config/deployment.py backend/config/settings/base.py \
  backend/config/settings/prod.py \
  backend/apps/core/tests/test_public_origin_settings.py \
  ai-service/tests/contract/test_compose_boundaries.py \
  ai-service/tests/integration/test_database_credentials.py
git commit -m "refactor: internalize deployment runtime defaults"
```

### Task 3: Add safe env initialization

**Files:**
- Create: `scripts/setup-env.sh`
- Modify: `ai-service/tests/contract/test_setup_env.py`

**Interfaces:**
- Consumes: CLI `--target cloud-vm|self-hosted`, `--storage r2`, `--origin ORIGIN`, optional `--output PATH`, optional `--force`; R2 fields from the calling environment or silent interactive prompts.
- Produces: an atomic active env file with the ten contract keys plus generated
  `HOST_PROJECT_ROOT` and `DOCKER_GID`; exit code 0 only after
  `docker compose --env-file OUTPUT config --quiet` succeeds.

- [ ] **Step 1: Add failing subprocess tests for the script contract**

Add helpers that run the script with this environment:

```python
EXPECTED_ACTIVE_KEYS = {
    "QJUDGE_PUBLIC_ORIGIN", "SECRET_KEY", "POSTGRES_ADMIN_PASSWORD",
    "DB_PASSWORD", "AI_DB_PASSWORD", "CREDENTIAL_LEASE_SECRET",
    "OBJECT_STORAGE_ENDPOINT_URL", "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL",
    "OBJECT_STORAGE_ACCESS_KEY", "OBJECT_STORAGE_SECRET_KEY",
}
GENERATED_SECRET_KEYS = {
    "SECRET_KEY", "POSTGRES_ADMIN_PASSWORD", "DB_PASSWORD",
    "AI_DB_PASSWORD", "CREDENTIAL_LEASE_SECRET",
}
storage_environment = {
    "OBJECT_STORAGE_ENDPOINT_URL": "https://storage.example.test",
    "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": "https://storage.example.test",
    "OBJECT_STORAGE_ACCESS_KEY": "storage-key",
    "OBJECT_STORAGE_SECRET_KEY": "storage-secret",
}
```

Test these cases:

```python
def _run_setup(tmp_path, *, origin="https://judge.example.test", storage="r2"):
    output = tmp_path / ".env"
    environment = os.environ.copy()
    environment.update(storage_environment)
    result = subprocess.run(
        [
            "bash", str(REPOSITORY_ROOT / "scripts/setup-env.sh"),
            "--target", "self-hosted", "--storage", storage,
            "--origin", origin, "--output", str(output),
        ],
        cwd=REPOSITORY_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    return result, output


def test_setup_env_generates_complete_secret_safe_file(tmp_path) -> None:
    result, output = _run_setup(tmp_path)
    assert result.returncode == 0, result.stderr
    values = dict(
        line.split("=", 1) for line in output.read_text().splitlines()
        if line and not line.startswith("#")
    )
    assert set(values) == EXPECTED_ACTIVE_KEYS | {"HOST_PROJECT_ROOT", "DOCKER_GID"}
    generated = [values[name] for name in GENERATED_SECRET_KEYS]
    assert all(generated)
    assert len(generated) == len(set(generated))
    assert values["DB_PASSWORD"].isalnum()
    assert values["AI_DB_PASSWORD"].isalnum()
    assert values["DOCKER_GID"].isdigit()


def test_setup_env_refuses_to_overwrite_existing_file(tmp_path) -> None:
    output = tmp_path / ".env"
    output.write_text("sentinel=true\n")
    result, _ = _run_setup(tmp_path)
    assert result.returncode != 0
    assert output.read_text() == "sentinel=true\n"


def test_setup_env_rejects_origin_with_path_before_writing(tmp_path) -> None:
    result, output = _run_setup(tmp_path, origin="https://judge.example.test/path")
    assert result.returncode != 0
    assert not output.exists()


def test_setup_env_never_prints_supplied_or_generated_secrets(tmp_path) -> None:
    result, output = _run_setup(tmp_path)
    values = output.read_text()
    captured = result.stdout + result.stderr
    for secret in ("storage-key", "storage-secret"):
        assert secret not in captured
    for name in GENERATED_SECRET_KEYS:
        value = dict(
            line.split("=", 1) for line in values.splitlines() if "=" in line
        )[name]
        assert value not in captured


def test_setup_env_rejects_unimplemented_minio_mode(tmp_path) -> None:
    result, output = _run_setup(tmp_path, storage="minio")
    assert result.returncode != 0
    assert "MinIO setup is not implemented" in result.stderr
    assert not output.exists()
```

The success test must parse the output file, assert the ten contract keys plus
`HOST_PROJECT_ROOT` and `DOCKER_GID`, assert all five generated secrets are non-empty and
distinct, assert database passwords match `^[A-Za-z0-9]+$`, and assert the detected GID
is numeric.

- [ ] **Step 2: Run the new script tests and verify RED**

Run:

```bash
python3 -m pytest ai-service/tests/contract/test_setup_env.py -q
```

Expected: failure because `scripts/setup-env.sh` does not exist.

- [ ] **Step 3: Implement `setup-env.sh` atomically**

Use `set -euo pipefail`. Parse options without external dependencies. Validate the origin with a Python standard-library snippet using `urllib.parse.urlsplit`; require `http` or `https`, a hostname, and empty path except `/`, query, and fragment. Generate secrets by reading five newline-delimited values from this standard-library program:

```python
import secrets
import string

alphabet = string.ascii_letters + string.digits
print(secrets.token_urlsafe(48))
print(secrets.token_urlsafe(32))
print("".join(secrets.choice(alphabet) for _ in range(48)))
print("".join(secrets.choice(alphabet) for _ in range(48)))
print("".join(secrets.choice(alphabet) for _ in range(48)))
```

The two token values become `SECRET_KEY` and `CREDENTIAL_LEASE_SECRET`; the three
alphanumeric values become the PostgreSQL administrator, Django and AI passwords.

Write to a temporary file in the output directory, set mode `0600`, render Compose against the temporary file, then rename it to the requested output. Install a trap that removes the temporary file on any error. Never pass secrets on argv and never echo them.

Derive `HOST_PROJECT_ROOT` from the repository root. Detect the Docker socket group with
`python3 -c 'import os; print(os.stat("/var/run/docker.sock").st_gid)'`; fail with an
actionable message if the socket cannot be inspected. When required R2 values are absent and stdin is interactive,
prompt for endpoint and access key normally and read both secret values with echo
disabled. In non-interactive execution, fail before creating the output file.

- [ ] **Step 4: Run script tests and shell syntax checks for GREEN**

Run:

```bash
bash -n scripts/setup-env.sh
python3 -m pytest ai-service/tests/contract/test_setup_env.py -q
```

Expected: all tests pass with no secret values in captured output.

- [ ] **Step 5: Commit the initializer**

```bash
git add scripts/setup-env.sh ai-service/tests/contract/test_setup_env.py
git commit -m "feat: initialize minimal deployment environment"
```

### Task 4: Reduce production deployment validation to the real contract

**Files:**
- Modify: `scripts/deploy-prod.sh`
- Modify: `ai-service/tests/contract/test_compose_boundaries.py`

**Interfaces:**
- Consumes: the minimal active `.env`; optional `TUNNEL_TOKEN` and optional external-provider groups.
- Produces: the existing checkout/build/up/database-role/smoke workflow, with `--profile tunnel` only when a token is present.

- [ ] **Step 1: Add failing deploy-script behavior tests**

Change `test_production_deploy_does_not_require_removed_integrations` to use the new minimal fixture with no Tunnel token. Assert the command log contains no `--profile tunnel` and no `cloudflared` requirement. Add a second test with `TUNNEL_TOKEN=secure-tunnel-token` appended to `.env` and assert every Compose deployment command includes `--profile tunnel`.

Add source assertions that the script no longer requires:

```python
for key in (
    "AI_DATABASE_URL", "AI_REDIS_URL", "AI_QUEUE_NAME", "AI_QUEUE_KEY_PREFIX",
    "DB_SSLMODE", "FRONTEND_URL", "ALLOWED_HOSTS", "CORS_ALLOWED_ORIGINS",
    "CSRF_TRUSTED_ORIGINS", "REDIS_URL", "MCP_PUBLIC_URL", "OAUTH_ISSUER_URL",
    "OBJECT_STORAGE_REGION", "ANTICHEAT_RAW_BUCKET",
    "MARKDOWN_IMAGE_S3_BUCKET", "MARKDOWN_IMAGE_PUBLIC_BASE_URL",
    "AI_ARTIFACT_S3_BUCKET",
):
    assert f"  {key}\n" not in required_block
```

- [ ] **Step 2: Run deploy tests and verify RED**

Run:

```bash
python3 -m pytest ai-service/tests/contract/test_compose_boundaries.py \
  -q -k 'production_deploy'
```

Expected: the current script rejects the minimal env because it requires 32 values and Tunnel.

- [ ] **Step 3: Implement conditional validation and profile selection**

The unconditional required set becomes:

```bash
required_env_keys=(
  POSTGRES_ADMIN_PASSWORD DB_PASSWORD AI_DB_PASSWORD
  CREDENTIAL_LEASE_SECRET SECRET_KEY QJUDGE_PUBLIC_ORIGIN
  OBJECT_STORAGE_ENDPOINT_URL OBJECT_STORAGE_PUBLIC_ENDPOINT_URL
  OBJECT_STORAGE_ACCESS_KEY OBJECT_STORAGE_SECRET_KEY
)
```

Use fixed database role names for the post-start privilege query. Detect a non-empty `TUNNEL_TOKEN` and append `--profile tunnel` to `COMPOSE_FILES`; otherwise leave the default service set unchanged. Remove manual `AI_DATABASE_URL` parsing because Compose owns its construction. Keep placeholder and weak-password rejection for generated secrets and storage credentials.

- [ ] **Step 4: Run deploy contracts and shell syntax checks for GREEN**

Run:

```bash
bash -n scripts/deploy-prod.sh
python3 -m pytest ai-service/tests/contract/test_compose_boundaries.py -q
```

Expected: minimal deployment succeeds through the fake command harness; Tunnel remains conditional.

- [ ] **Step 5: Commit the thin deploy wrapper**

```bash
git add scripts/deploy-prod.sh ai-service/tests/contract/test_compose_boundaries.py
git commit -m "refactor: validate only active deployment inputs"
```

### Task 5: Publish the cleaned template and operator documentation

**Files:**
- Modify: `.env.example`
- Create: `docs/examples/loadtest.env.example`
- Modify: `README.md`
- Modify: `docs/deployment.md`
- Modify: `docs/cloudflare.md`
- Test: `ai-service/tests/contract/test_setup_env.py`

**Interfaces:**
- Consumes: the finalized ten-key contract and `setup-env.sh` CLI.
- Produces: one root deployment template, a separate loadtest-only example, and accurate manual/CD instructions.

- [ ] **Step 1: Run the env-example contract and verify it is still RED**

Run:

```bash
python3 -m pytest ai-service/tests/contract/test_setup_env.py \
  -q -k 'root_env_example'
```

Expected: `.env.example` still exposes the old 94 active keys.

- [ ] **Step 2: Replace the root example with the minimal schema**

Keep exactly the ten active assignments asserted in Task 1 and leave generated-secret and
external-service values empty. Include optional AI, OAuth, SMTP, Realtime, Remote MCP,
and Tunnel variables only as commented examples with empty values.

Move all six `LOADTEST_*` assignments verbatim to `docs/examples/loadtest.env.example`. Do not add a second general deployment template.

- [ ] **Step 3: Update deployment documentation**

Document this local-first flow:

```bash
export OBJECT_STORAGE_ENDPOINT_URL=https://ACCOUNT_ID.r2.cloudflarestorage.com
export OBJECT_STORAGE_PUBLIC_ENDPOINT_URL="$OBJECT_STORAGE_ENDPOINT_URL"
read -r -p "R2 access key: " OBJECT_STORAGE_ACCESS_KEY
read -r -s -p "R2 secret key: " OBJECT_STORAGE_SECRET_KEY
export OBJECT_STORAGE_ACCESS_KEY OBJECT_STORAGE_SECRET_KEY
./scripts/setup-env.sh \
  --target self-hosted \
  --storage r2 \
  --origin http://HOST_OR_IP
docker compose up -d --build
```

Explain that secrets are prompted or read from the current process without appearing in shell history, Tunnel is optional, and EC2/MinIO instructions come later. Remove remaining claims that the root env must contain loadtest, monitoring, billing, fixed internal URLs, or Cloudflare-only settings.

- [ ] **Step 4: Run complete verification**

Run:

```bash
bash -n scripts/setup-env.sh scripts/deploy-prod.sh
sh -n scripts/db/bootstrap-ai-database.sh
python3 -m pytest \
  ai-service/tests/contract/test_setup_env.py \
  ai-service/tests/contract/test_compose_boundaries.py \
  ai-service/tests/integration/test_database_credentials.py -q
verification_env="$(mktemp)"
trap 'rm -f "$verification_env"' EXIT
OBJECT_STORAGE_ENDPOINT_URL=https://storage.example.test \
OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=https://storage.example.test \
OBJECT_STORAGE_ACCESS_KEY=verification-key \
OBJECT_STORAGE_SECRET_KEY=verification-secret \
  ./scripts/setup-env.sh --target self-hosted --storage r2 \
    --origin http://judge.example.test --output "$verification_env"
docker compose --env-file "$verification_env" -f docker-compose.yml config -q
docker compose --env-file "$verification_env" -f docker-compose.dev.yml config -q
docker compose -f docker-compose.test.yml config -q
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test run --rm ai-db-bootstrap
git diff --check
```

Expected: all syntax checks, tests, Compose renders, and the real test database bootstrap pass.

- [ ] **Step 5: Commit the operator-facing cleanup**

```bash
git add .env.example docs/examples/loadtest.env.example README.md \
  docs/deployment.md docs/cloudflare.md \
  ai-service/tests/contract/test_setup_env.py
git commit -m "docs: publish minimal deployment environment"
```
