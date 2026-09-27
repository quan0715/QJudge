이 가이드에서는 QJudge 로컬 개발 환경을 구성합니다. 개발 환경은 운영용 `deploy/compose.yml` 위에 `compose.dev.yml`을 겹친 것으로, 소스 코드 마운트, 핫 리로드, localhost 포트, 같은 Compose 프로젝트 안의 MinIO를 추가합니다. 설정 파일은 운영 환경과 같은 `deploy/.env`입니다. 운영 사이트를 구축하려면 [배포](/docs/deployment)(번체 중국어)를 참고하세요.

로컬 환경은 이것 하나뿐입니다. 데이터베이스가 필요한 백엔드 테스트와 E2E는 CI에서 실행합니다(6절).

## 1. 필요한 도구

- Git
- Docker(Compose v2 포함)
- Python 3(`deploy/qjudge check` 실행용)

Node.js와 각 서비스의 Python 패키지는 컨테이너 안에 있습니다.

## 2. 코드 가져오기

```bash
git clone https://github.com/quan0715/QJudge.git
cd QJudge
```

## 3. `deploy/.env` 만들기

```bash
cp deploy/.env.example deploy/.env
```

다음 값을 채우고 나머지는 비워 둡니다.

```text
QJUDGE_PUBLIC_ORIGIN=http://localhost:5173
COMPOSE_PROJECT_NAME=qjudge-dev
SECRET_KEY=<무작위 문자열>
POSTGRES_ADMIN_PASSWORD=<무작위 문자열>
DB_PASSWORD=<무작위 문자열>
AI_DB_PASSWORD=<무작위 문자열>
CREDENTIAL_LEASE_SECRET=<무작위 문자열>
HOST_PROJECT_ROOT=<이 checkout의 절대 경로>
STORAGE_MODE=bundled
OBJECT_STORAGE_ENDPOINT_URL=http://minio:9000
OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=http://localhost:9000
OBJECT_STORAGE_ACCESS_KEY=qjudge
OBJECT_STORAGE_SECRET_KEY=<8자 이상의 무작위 문자열>
OBJECT_STORAGE_BUCKET=qjudge
```

무작위 문자열은 `python3 -c 'import secrets; print(secrets.token_urlsafe(24))'`로 만들 수 있습니다. 데이터베이스 비밀번호에는 영문자, 숫자, `-._~`만 사용할 수 있습니다. `COMPOSE_PROJECT_NAME`은 컨테이너와 볼륨 이름이 되므로 같은 컴퓨터의 checkout마다 다른 이름을 사용하세요.

설정을 검증합니다.

```bash
deploy/qjudge check
```

`…/deploy/.env: OK`가 표시되면 다음으로 진행합니다.

## 4. 서비스 시작

모든 Compose 명령은 래퍼를 통해 실행합니다. 래퍼가 올바른 compose 파일을 선택합니다. 처음 시작할 때:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev build
docker pull --platform linux/amd64 ghcr.io/quan0715/qjudge/judge:latest
deploy/qjudge secrets --image qjudge/backend:dev
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev run --rm storage-init
```

`deploy/qjudge secrets`는 서비스가 마운트하는 AI OAuth 및 Integrity 키를 `deploy/secrets/`에 생성하며, 첫 `up` 전에 있어야 합니다. 기존 키는 그대로 유지됩니다. 채점 워커는 받아 둔 채점 이미지에서 제출을 실행합니다. `storage-init`은 MinIO에 `OBJECT_STORAGE_BUCKET`을 만듭니다. `backend`와 `ai-service`는 시작할 때 마이그레이션을 적용합니다.

테스트 계정과 예제 문제가 필요하면:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py seed_e2e_data
```

상태를 확인합니다.

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev ps
./scripts/dev/check-dev-services.sh
```

| 서비스 | URL |
| --- | --- |
| QJudge(Vite) | `http://localhost:5173` |
| Backend API | `http://localhost:8000` |
| AI Service | `http://localhost:8001`(`/health/live`, `/health/ready`) |
| Storybook | `http://localhost:6006` 또는 `http://localhost:5173/dev/storybook/` |
| MCP Server | `http://localhost:9002/mcp` |
| MinIO | API `http://localhost:9000`, 콘솔 `http://localhost:9001` |

PostgreSQL, PgBouncer, Redis는 `127.0.0.1`의 `5432`, `6432`, `6379` 포트를 사용합니다. 포트가 충돌하면 래퍼를 실행하는 셸에서 `DEV_FRONTEND_PORT` 같은 변수를 설정하세요(이름은 `compose.dev.yml` 참고). 이 변수들을 `deploy/.env`에 넣지 마세요. `check`가 알 수 없는 키로 보고합니다.

`COMPOSE_PROFILES`에 `tunnel`(`TUNNEL_TOKEN` 필요)이나 `live-monitoring`(Git에 포함되지 않는 `.tmp/livekit/dev.json`을 읽는 개발용 LiveKit)을 추가할 수 있습니다.

## 5. 코드 수정과 로그 확인

frontend, backend, ai-service 소스는 컨테이너에 마운트되어 있어 대부분의 변경은 저장하면 다시 로드됩니다. 의존성이나 Dockerfile을 바꾼 경우 `dev up -d --build`를 실행합니다.

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f frontend
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f backend
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f ai-service
```

`Ctrl+C`는 로그 보기만 종료하며 서비스는 계속 실행됩니다.

## 6. 테스트 실행

Frontend:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run lint
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run typecheck
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run test
```

AI Service:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T ai-service python -m pytest -q tests/unit
```

데이터베이스를 사용하지 않는 백엔드 테스트는 dev에서 실행할 수 있습니다. pytest-django는 표시되지 않은 테스트의 데이터베이스 접근을 막습니다.

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend \
  python -m pytest -q --ds=config.settings.test apps/ai/tests/test_start_run_serializer.py
```

로컬에는 테스트용 데이터베이스가 없습니다. 데이터베이스가 필요한 백엔드 테스트는 CI의 Backend Unit Tests와 Judge Tests에서 실행되고, 통합 테스트와 E2E는 CI에서 새로 설치한 스택을 대상으로 실행됩니다([E2E 테스트](/docs/e2e-testing) 참고).

## 7. 중지와 재시작

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev down
```

컨테이너는 제거되지만 데이터 볼륨은 유지됩니다. `dev up -d`로 다시 시작할 수 있습니다. `down -v`는 사용하지 마세요. 로컬 데이터베이스와 MinIO 데이터가 삭제됩니다.

다음으로 [기여 가이드](/docs/contributing)에서 브랜치, 테스트, 문서 규칙을 확인하세요.
