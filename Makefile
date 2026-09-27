.PHONY: help dev dev-build dev-down integrity-secrets integrity-resident-build judge-build

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

# --- Judge System ---
judge-build:
	docker build -t oj-judge:latest -f backend/judge/Dockerfile.judge backend/judge
