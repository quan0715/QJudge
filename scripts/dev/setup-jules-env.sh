#!/usr/bin/env bash
# Google Jules Remote Environment Setup Script for QJudge
# Usage:
#   bash scripts/dev/setup-jules-env.sh [--mode dev|e2e] [--skip-seed]
set -euo pipefail

MODE="dev"
SKIP_SEED="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-dev}"
      shift 2
      ;;
    --skip-seed)
      SKIP_SEED="true"
      shift
      ;;
    -h|--help)
      cat <<'USAGE'
Usage: bash scripts/dev/setup-jules-env.sh [options]

Options:
  --mode <dev|e2e>   Environment stack to start:
                     - dev (default): qjudge-dc.sh dev stack (ports 5173, 8000, 8001, 6006, 9000, 9002)
                     - e2e: ci/e2e-stack.sh fresh install stack (port 8080)
  --skip-seed        Skip running `python manage.py seed_e2e_data` in dev mode
  -h, --help         Show this help message
USAGE
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DC_SCRIPT="$ROOT_DIR/.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh"
JUDGE_IMAGE="ghcr.io/quan0715/qjudge/judge:latest"
DOCKERFILE_BACKUP_DIR=""
DOCKERFILES=(backend/Dockerfile backend/judge/Dockerfile.judge frontend/Dockerfile.dev ai-service/Dockerfile integrity-service/Dockerfile.resident mcp-server/Dockerfile)

log() {
  printf '\n==> %s\n' "$*"
}

restore_dockerfiles() {
  [[ -n "$DOCKERFILE_BACKUP_DIR" ]] || return 0
  local file
  for file in "${DOCKERFILES[@]}"; do
    cp -p "$DOCKERFILE_BACKUP_DIR/$file" "$ROOT_DIR/$file"
  done
  rm -rf "$DOCKERFILE_BACKUP_DIR"
  DOCKERFILE_BACKUP_DIR=""
}
trap restore_dockerfiles EXIT

patch_dockerfiles_for_legacy_builder() {
  local file
  DOCKERFILE_BACKUP_DIR="$(mktemp -d)"
  for file in "${DOCKERFILES[@]}"; do
    mkdir -p "$(dirname "$DOCKERFILE_BACKUP_DIR/$file")"
    cp -p "$ROOT_DIR/$file" "$DOCKERFILE_BACKUP_DIR/$file"
  done
  python3 - <<'PY'
from pathlib import Path
import re

for p in [Path("backend/judge/Dockerfile.judge")]:
    if p.exists():
        text = p.read_text()
        text = re.sub(r"^# syntax=docker/dockerfile:1\n", "", text)
        text = re.sub(r"--mount=type=cache,[^\s\\]+\s*", "", text)
        p.write_text(text)

Path("backend/Dockerfile").write_text("""FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
CMD ["sh", "-c", "python manage.py migrate && python manage.py collectstatic --noinput && python manage.py runserver 0.0.0.0:8000"]
COPY . .
RUN for i in 1 2 3 4 5; do \\
      apt-get update && \\
      apt-get install -y --no-install-recommends \\
        postgresql-client gcc curl \\
        libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 \\
        libffi-dev libcairo2 shared-mime-info \\
        fonts-noto-cjk fonts-noto-color-emoji && \\
      break || sleep 10; \\
    done && rm -rf /var/lib/apt/lists/* && \\
    pip install --no-cache-dir -r requirements/dev.txt && \\
    mkdir -p logs
""")

Path("ai-service/Dockerfile").write_text("""FROM python:3.11-slim
WORKDIR /app
EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD curl -f http://localhost:8001/health/ready || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
COPY . .
RUN for i in 1 2 3 4 5; do \\
      apt-get update && \\
      apt-get install -y --no-install-recommends curl && \\
      break || sleep 10; \\
    done && rm -rf /var/lib/apt/lists/* && \\
    pip install --no-cache-dir . && \\
    useradd --create-home --shell /bin/bash appuser && \\
    chown -R appuser:appuser /app
""")

Path("integrity-service/Dockerfile.resident").write_text("""FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
EXPOSE 8011
CMD ["uvicorn", "integrity_service.resident.app:app", "--host", "0.0.0.0", "--port", "8011", "--workers", "1"]
COPY pyproject.toml .
COPY integrity_service ./integrity_service
RUN pip install --no-cache-dir ".[worker]" && \\
    groupadd --gid 10001 integrity && \\
    useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin integrity && \\
    mkdir /run-data && chown 10001:10001 /run-data && chmod 0700 /run-data
""")

Path("mcp-server/Dockerfile").write_text("""FROM python:3.11-slim
WORKDIR /app
EXPOSE 9000
CMD ["python", "server.py"]
COPY mcp-server/ .
RUN pip install --no-cache-dir .
""")

frontend_base = Path("frontend/Dockerfile.dev").read_text().splitlines()[0]
Path("frontend/Dockerfile.dev").write_text(frontend_base + "\n" + """WORKDIR /app
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --no-audit && npm cache clean --force
""")
PY
}

probe_docker() {
  local tmpdir
  tmpdir="$(mktemp -d)"
  printf 'FROM python:3.11-slim\nRUN echo ok > /ok\n' > "$tmpdir/Dockerfile"
  if DOCKER_BUILDKIT=0 docker build -q -t qjudge-probe:test "$tmpdir" >/dev/null 2>&1 \
     && docker run --rm qjudge-probe:test cat /ok >/dev/null 2>&1; then
    docker rmi -f qjudge-probe:test >/dev/null 2>&1 || true
    rm -rf "$tmpdir"
    return 0
  fi
  rm -rf "$tmpdir"
  return 1
}

ensure_docker_running() {
  log "Checking Docker daemon..."
  export DOCKER_BUILDKIT=0
  export COMPOSE_DOCKER_CLI_BUILD=0

  if ! docker info >/dev/null 2>&1 || ! probe_docker; then
    log "Configuring Docker with vfs storage driver (containerd-snapshotter=false) for Jules VM..."
    sudo mkdir -p /etc/docker
    echo '{"storage-driver": "vfs", "features": {"containerd-snapshotter": false}}' | sudo tee /etc/docker/daemon.json >/dev/null
    sudo service docker restart || sudo service docker start || sudo systemctl restart docker
    for _ in $(seq 1 20); do
      if docker info >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "[FAIL] Docker daemon is not accessible." >&2
    exit 1
  fi
  echo "[OK] Docker daemon ready."
}

ensure_hosts_entry() {
  if ! grep -qE '(^|[[:space:]])minio($|[[:space:]])' /etc/hosts 2>/dev/null; then
    if command -v sudo >/dev/null 2>&1 && [[ "$(uname -s)" == "Linux" ]]; then
      log "Adding 127.0.0.1 minio to /etc/hosts..."
      echo "127.0.0.1 minio" | sudo tee -a /etc/hosts >/dev/null || true
    fi
  fi
}

ensure_judge_image() {
  log "Ensuring judge image ($JUDGE_IMAGE) is available..."
  if docker image inspect "$JUDGE_IMAGE" >/dev/null 2>&1; then
    echo "[OK] $JUDGE_IMAGE already present locally."
    return 0
  fi

  if docker pull --platform linux/amd64 "$JUDGE_IMAGE"; then
    docker tag "$JUDGE_IMAGE" oj-judge:latest || true
    echo "[OK] Pulled $JUDGE_IMAGE."
    return 0
  fi

  log "GHCR pull unavailable; building judge image locally from backend/judge/Dockerfile.judge..."
  DOCKER_BUILDKIT=0 docker build -t "$JUDGE_IMAGE" -t oj-judge:latest -f "$ROOT_DIR/backend/judge/Dockerfile.judge" "$ROOT_DIR/backend/judge"
}

build_dev_images() {
  log "Building dev Docker images sequentially with single-RUN vfs layout..."
  DOCKER_BUILDKIT=0 docker build -t qjudge/backend:dev -f "$ROOT_DIR/backend/Dockerfile" "$ROOT_DIR/backend"
  DOCKER_BUILDKIT=0 docker build -t qjudge/ai-service:dev -f "$ROOT_DIR/ai-service/Dockerfile" "$ROOT_DIR/ai-service"
  DOCKER_BUILDKIT=0 docker build -t qjudge/integrity-resident:dev -f "$ROOT_DIR/integrity-service/Dockerfile.resident" "$ROOT_DIR/integrity-service"
  DOCKER_BUILDKIT=0 docker build -t qjudge/mcp:dev -f "$ROOT_DIR/mcp-server/Dockerfile" "$ROOT_DIR"
  DOCKER_BUILDKIT=0 docker build -t qjudge/frontend-dev:dev -f "$ROOT_DIR/frontend/Dockerfile.dev" "$ROOT_DIR/frontend"
  restore_dockerfiles

  if [[ ! -d "$ROOT_DIR/frontend/node_modules" ]]; then
    log "Populating host frontend/node_modules from qjudge/frontend-dev:dev..."
    local cid
    cid="$(docker create qjudge/frontend-dev:dev)"
    docker cp "$cid:/app/node_modules" "$ROOT_DIR/frontend/node_modules"
    docker rm -f "$cid" >/dev/null
  fi
}

wait_for_http() {
  local label="$1"
  local url="$2"
  local max_attempts="${3:-90}"
  log "Waiting for $label ($url)..."
  for attempt in $(seq 1 "$max_attempts"); do
    if curl --fail --silent --output /dev/null --max-time 4 "$url"; then
      echo "[OK] $label is ready."
      return 0
    fi
    if [[ "$attempt" -eq "$max_attempts" ]]; then
      echo "[FAIL] Timed out waiting for $label ($url)" >&2
      return 1
    fi
    sleep 2
  done
}

setup_dev_stack() {
  if [[ ! -f "$ROOT_DIR/deploy/.env" ]]; then
    log "Creating deploy/.env for dev environment..."
    "$ROOT_DIR/deploy/qjudge" init --non-interactive \
      --set QJUDGE_PUBLIC_ORIGIN=http://localhost:5173 \
      --set COMPOSE_PROJECT_NAME=qjudge-dev \
      --set STORAGE_MODE=bundled \
      --set OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=http://localhost:9000 \
      --set HOST_PROJECT_ROOT="$ROOT_DIR"
  else
    log "deploy/.env already exists; keeping existing configuration."
  fi

  log "Validating deploy/.env..."
  "$ROOT_DIR/deploy/qjudge" check

  patch_dockerfiles_for_legacy_builder
  ensure_judge_image
  build_dev_images

  log "Bootstrapping AI OAuth and Integrity secrets..."
  "$ROOT_DIR/deploy/qjudge" secrets --image qjudge/backend:dev

  log "Starting dev Docker Compose stack..."
  "$DC_SCRIPT" dev up -d --no-build

  log "Initializing MinIO bucket (storage-init)..."
  "$DC_SCRIPT" dev run --rm storage-init

  wait_for_http "Backend API" "http://localhost:8000/api/health/" 90
  wait_for_http "Frontend (Vite)" "http://localhost:5173/" 90
  wait_for_http "Storybook" "http://localhost:6006/" 90

  if [[ "$SKIP_SEED" != "true" ]]; then
    log "Seeding E2E / development sample data..."
    "$DC_SCRIPT" dev exec -T backend python manage.py seed_e2e_data
  fi

  log "Running dev services health check..."
  "$ROOT_DIR/scripts/dev/check-dev-services.sh"
}

setup_e2e_stack() {
  patch_dockerfiles_for_legacy_builder
  ensure_judge_image
  log "Starting E2E stack via ci/e2e-stack.sh..."
  "$ROOT_DIR/ci/e2e-stack.sh" --set COMPOSE_PROJECT_NAME=qjudge-e2e
  restore_dockerfiles
}

ensure_docker_running
ensure_hosts_entry

case "$MODE" in
  dev)
    setup_dev_stack
    ;;
  e2e)
    setup_e2e_stack
    ;;
  *)
    echo "Unsupported mode: $MODE (expected: dev or e2e)" >&2
    exit 2
    ;;
esac

log "QJudge Jules remote environment ($MODE) is ready!"
