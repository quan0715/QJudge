.PHONY: help dev dev-build dev-down integrity-secrets integrity-resident-build test test-down judge-build

# Default target
help:
	@echo "Online Judge - Development Commands"
	@echo ""
	@echo "Usage:"
	@echo "  make <target>"
	@echo ""
	@echo "Development Environment:"
	@echo "  dev             Start the development stack (frontend, backend, db, redis, ai-service)"
	@echo "  dev-build       Build and start the development stack"
	@echo "  dev-down        Stop and remove development containers"
	@echo ""
	@echo "Testing Environment:"
	@echo "  test            Start the testing stack (used for e2e and integration tests)"
	@echo "  test-build      Build and start the testing stack"
	@echo "  test-down       Stop and remove testing containers and volumes"
	@echo ""
	@echo "Judge System:"
	@echo "  judge-build     Build the oj-judge Docker image locally"
	@echo "  integrity-secrets       Create missing local Integrity credentials"
	@echo "  integrity-resident-build  Build the resident Integrity service"
	@echo ""

# --- Development ---
dev: integrity-secrets integrity-resident-build
	.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d

dev-build: integrity-secrets integrity-resident-build
	.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --build

dev-down:
	.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev down

integrity-secrets:
	.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev run --rm --no-deps --build integrity-bootstrap

integrity-resident-build:
	.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev build integrity-resident

# --- Testing ---
test:
	docker compose -f docker-compose.test.yml up -d

test-build:
	docker compose -f docker-compose.test.yml up -d --build

test-down:
	docker compose -f docker-compose.test.yml down -v

# --- Judge System ---
judge-build:
	docker build -t oj-judge:latest -f backend/judge/Dockerfile.judge backend/judge
