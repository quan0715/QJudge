.PHONY: help dev dev-down test test-down monitor monitor-down loadtest loadtest-down judge-build

# Default target
help:
	@echo "Online Judge - Development Commands"
	@echo ""
	@echo "Usage:"
	@echo "  make <target>"
	@echo ""
	@echo "Development Environment:"
	@echo "  dev             Start the development stack (frontend, backend, db, redis, minio, ai-service)"
	@echo "  dev-build       Build and start the development stack"
	@echo "  dev-down        Stop and remove development containers"
	@echo ""
	@echo "Testing Environment:"
	@echo "  test            Start the testing stack (used for e2e and integration tests)"
	@echo "  test-build      Build and start the testing stack"
	@echo "  test-down       Stop and remove testing containers and volumes"
	@echo ""
	@echo "Monitoring (Overlay):"
	@echo "  monitor         Start monitoring stack (Prometheus, Grafana) alongside dev"
	@echo "  monitor-down    Stop monitoring stack"
	@echo ""
	@echo "Load Testing:"
	@echo "  loadtest        Start the load testing stack"
	@echo "  loadtest-build  Build and start the load testing stack"
	@echo "  loadtest-down   Stop and remove load testing containers and volumes"
	@echo ""
	@echo "Judge System:"
	@echo "  judge-build     Build the oj-judge Docker image locally"
	@echo ""

# --- Development ---
dev:
	docker compose -f docker-compose.dev.yml up -d

dev-build:
	docker compose -f docker-compose.dev.yml up -d --build

dev-down:
	docker compose -f docker-compose.dev.yml down

# --- Testing ---
test:
	docker compose -f docker-compose.test.yml up -d

test-build:
	docker compose -f docker-compose.test.yml up -d --build

test-down:
	docker compose -f docker-compose.test.yml down -v

# --- Monitoring ---
monitor:
	docker compose -f docker-compose.dev.yml -f docker-compose.monitoring.yml up -d

monitor-down:
	docker compose -f docker-compose.dev.yml -f docker-compose.monitoring.yml down

# --- Load Testing ---
loadtest:
	docker compose -f docker-compose.test.yml -f loadtest/docker-compose.loadtest.yml up -d

loadtest-build:
	docker compose -f docker-compose.test.yml -f loadtest/docker-compose.loadtest.yml up -d --build

loadtest-down:
	docker compose -f docker-compose.test.yml -f loadtest/docker-compose.loadtest.yml down -v

# --- Judge System ---
judge-build:
	docker build -t oj-judge:latest -f backend/judge/Dockerfile.judge backend/judge
