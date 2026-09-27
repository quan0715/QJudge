E2E와 API 통합 테스트는 일반 설치 절차로 처음부터 구성한 QJudge를 대상으로 CI에서 실행합니다. Playwright와 Vitest는 runner에서 직접 실행되어 frontend(`http://localhost:8080`)에 연결합니다.

## CI 실행 위치

| Workflow | 실행 시점 | 내용 |
| --- | --- | --- |
| `ci.yml`의 Integration Tests | 모든 CI 실행 | `npm run test:api`와 MCP Server 통합 테스트 |
| `e2e.yml` | `main` 대상의 모든 pull request 또는 수동 실행 | 모든 그룹(auth, exam, contest, coding, settings). 수동 실행 시 그룹과 grep 지정 가능 |

모든 job은 먼저 `ci/e2e-stack.sh`를 실행합니다.

1. `deploy/qjudge init --non-interactive`: origin은 `http://localhost:8080`, bundled storage, 공개 storage URL은 `http://minio:9000`(runner는 `/etc/hosts`에서 `minio`를 `127.0.0.1`로 지정합니다).
2. `deploy/qjudge addon storage up`과 `init` 후 `deploy/qjudge upgrade`로 현재 commit을 설치합니다.
3. `ci/compose.e2e.yml`을 겹쳐 다시 시작합니다. Django는 `config.settings.test`를 사용하고, Celery는 비동기로 실행되며, AI 서비스는 fake adapters에 연결됩니다.
4. `seed_e2e_data`가 `admin`, `teacher`, `student`, `student2` 계정과 예제 문제·대회를 만듭니다. 테스트용 계정 정보는 `frontend/tests/helpers/data.helper.ts`에 있습니다.

스크립트는 이 스택의 compose 명령을 `$QJ_DC`에 저장하고, CI는 이를 사용해 서비스 로그를 수집하여 artifact로 업로드합니다.

## 로컬에서 실행

로컬에서 실행해야 할 때는 같은 스크립트를 별도의 git worktree와 Compose 프로젝트에서 사용합니다. checkout의 `deploy/.env`와 dev 데이터는 영향을 받지 않습니다.

```bash
git worktree add --detach ../qjudge-e2e HEAD
../qjudge-e2e/ci/e2e-stack.sh --set COMPOSE_PROJECT_NAME=qjudge-e2e
```

- 추가 `--set KEY=VALUE` 인수는 `deploy/qjudge init`에 전달되어 스크립트 기본값을 덮어씁니다.
- Bundled storage는 `9000`/`9001` 포트를 사용하므로 dev의 MinIO와 충돌합니다. 먼저 `qjudge-dc.sh dev stop`을 실행하거나, `--set STORAGE_MODE=external`과 다른 `OBJECT_STORAGE_*` 값으로 다른 S3 호환 서비스를 사용하세요(bucket이 이미 있어야 하고 CORS가 `http://localhost:8080`을 허용해야 합니다).
- Bundled storage를 사용할 때는 브라우저가 `minio`를 찾을 수 있도록 `/etc/hosts`에 `127.0.0.1 minio`를 추가합니다.

스크립트는 마지막에 이 스택의 compose 명령을 출력하며, 로그를 볼 때 사용할 수 있습니다. 이어서 worktree의 `frontend/`에서 테스트를 실행합니다.

```bash
cd ../qjudge-e2e/frontend
npm ci
npx playwright install chromium
npm run test:e2e -- tests/e2e/auth.e2e.spec.ts
npm run test:api
```

디버깅에는 `npm run test:e2e:ui`, `test:e2e:debug`, `test:e2e:report`를 사용합니다. 대상 URL은 `PLAYWRIGHT_BASE_URL`과 `API_BASE_URL`로 덮어쓸 수 있습니다.

끝나면 이 프로젝트만 정리합니다(dev에는 `-v`를 사용하지 마세요).

```bash
docker compose -p qjudge-e2e down -v
docker compose -p qjudge-e2e-storage down -v
git worktree remove --force ../qjudge-e2e
```

`upgrade`가 빌드한 `qjudge/*:sha-*` 이미지는 컴퓨터에 남습니다. 필요 없으면 `docker image rm`으로 삭제하세요.

## 테스트 작성

테스트는 `frontend/tests/e2e/`에, 로그인·데이터·시험 흐름의 공용 헬퍼는 `frontend/tests/helpers/`에 둡니다. 새 테스트는 필요한 강의실, 문제, 시험을 직접 만들고 끝나면 정리하여 다른 테스트가 남긴 데이터에 의존하지 않도록 합니다.
