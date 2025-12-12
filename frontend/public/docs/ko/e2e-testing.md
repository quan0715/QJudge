# E2E 테스트 가이드

이 문서에서는 프론트엔드 E2E 테스트를 설정하고 실행하는 방법을 설명합니다.

## 개요

이 프로젝트는 Playwright를 사용하여 엔드투엔드(E2E) 테스트를 수행하며, Docker Compose로 완전한 테스트 환경을 제공합니다:

- 독립된 테스트 데이터베이스 (PostgreSQL)
- 테스트용 Redis
- Django 백엔드 테스트 서비스
- Celery Worker (제출 처리용)
- React 프론트엔드 테스트 서비스
- 사전 주입된 테스트 데이터

## 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                    Playwright 테스트                     │
│                   (localhost:5174)                       │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Docker Compose 테스트 환경                  │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Frontend   │  │   Backend    │  │   Celery     │  │
│  │   :5174      │◄─┤   :8001      │◄─┤   Worker     │  │
│  └──────────────┘  └──────┬───────┘  └──────┬───────┘  │
│                           │                  │          │
│                   ┌───────▼────────┐ ┌──────▼───────┐  │
│                   │   PostgreSQL   │ │    Redis     │  │
│                   │   (test_oj_e2e)│ │   :6380      │  │
│                   └────────────────┘ └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 테스트 데이터

테스트 환경에는 다음 테스트 데이터가 자동으로 주입됩니다:

### 테스트 사용자

| 역할     | Email                | 비밀번호   | 용도               |
| -------- | -------------------- | ---------- | ------------------ |
| Admin    | admin@example.com    | admin123   | 관리자 테스트      |
| Teacher  | teacher@example.com  | teacher123 | 교사 기능 테스트   |
| Student  | student@example.com  | student123 | 학생 테스트        |
| Student2 | student2@example.com | student123 | 다중 사용자 테스트 |

### 테스트 문제

- **P001: A+B Problem** (쉬움) - 두 정수의 합 계산, 3개의 테스트 케이스
- **P002: Hello World** (쉬움) - "Hello, World!" 출력, 1개의 테스트 케이스
- **P003: Factorial** (중간) - 팩토리얼 계산, 3개의 테스트 케이스

### 테스트 대회

- **E2E Test Contest** (진행 중) - A+B Problem과 Hello World 포함, 참가 및 제출 가능
- **Upcoming Contest** (시작 전) - Factorial 포함, 아직 참가 불가

## 빠른 시작

### 1. 의존성 설치

```bash
cd frontend
npm install
```

### 2. Playwright 브라우저 설치

```bash
npx playwright install
```

### 3. 테스트 환경 시작

관리 스크립트를 사용하여 완전한 E2E 테스트 환경을 시작합니다:

```bash
# 방법 1: 관리 스크립트 사용 (권장)
./frontend/scripts/e2e-env.sh start

# 방법 2: Docker Compose 직접 사용
docker-compose -f docker-compose.test.yml up -d
```

서비스가 시작될 때까지 대기 (약 1-2분), 스크립트는 자동으로 서비스 준비 완료를 기다립니다.

### 4. 테스트 실행

```bash
cd frontend

# 모든 E2E 테스트 실행
npm run test:e2e

# UI 모드로 실행
npm run test:e2e:ui

# 디버그 모드
npm run test:e2e:debug

# 헤드 브라우저에서 실행
npm run test:e2e:headed

# 테스트 보고서 보기
npm run test:e2e:report
```

### 5. 테스트 환경 중지

```bash
# 관리 스크립트 사용
./frontend/scripts/e2e-env.sh stop

# 또는 Docker Compose 사용
docker-compose -f docker-compose.test.yml down -v
```

## 관리 스크립트 사용법

`frontend/scripts/e2e-env.sh`는 다음 명령을 제공합니다:

```bash
# 환경 시작
./frontend/scripts/e2e-env.sh start

# 환경 중지
./frontend/scripts/e2e-env.sh stop

# 환경 리셋 (테스트 데이터 재생성)
./frontend/scripts/e2e-env.sh reset

# 서비스 상태 확인
./frontend/scripts/e2e-env.sh status

# 로그 보기
./frontend/scripts/e2e-env.sh logs                # 모든 서비스
./frontend/scripts/e2e-env.sh logs backend_test   # 특정 서비스

# 컨테이너에서 명령 실행
./frontend/scripts/e2e-env.sh exec backend_test python manage.py shell

# 도움말 표시
./frontend/scripts/e2e-env.sh help
```

## 테스트 구조

```
frontend/
├── tests/
│   ├── e2e/                      # E2E 테스트 파일
│   │   ├── auth.e2e.spec.ts      # 인증 테스트
│   │   ├── problems.e2e.spec.ts  # 문제 목록 테스트
│   │   ├── submission.e2e.spec.ts# 제출 테스트
│   │   └── contest.e2e.spec.ts   # 대회 테스트
│   └── helpers/                  # 테스트 유틸리티
│       ├── auth.helper.ts        # 인증 헬퍼 함수
│       ├── data.helper.ts        # 테스트 데이터 상수
│       ├── setup.ts              # 전역 설정
│       └── teardown.ts           # 전역 정리
├── playwright.config.e2e.ts      # Playwright E2E 설정
└── scripts/
    └── e2e-env.sh                # 환경 관리 스크립트
```

## 테스트 커버리지

### 인증 테스트 (auth.e2e.spec.ts)

- 사용자 등록
- 사용자 로그인 (Student, Teacher, Admin)
- 사용자 로그아웃
- 잘못된 자격 증명 오류 처리
- 미인증 접근 보호
- 세션 지속성

### 문제 목록 테스트 (problems.e2e.spec.ts)

- 문제 목록 표시
- 문제 정보 표시 (제목, 난이도, 번호)
- 문제 클릭하여 상세 보기
- 페이지네이션
- 네비게이션

### 제출 테스트 (submission.e2e.spec.ts)

- 문제 상세 표시
- 문제 설명 및 테스트 케이스
- 코드 에디터
- 코드 제출
- 제출 결과 보기
- 제출 기록
- 제출 필터링

### 대회 테스트 (contest.e2e.spec.ts)

- 대회 목록 표시
- 대회 상태 표시
- 대회 상세 페이지
- 대회 참가
- 대회 문제 목록
- 대회 중 문제 풀기
- 대회 리더보드
- 시간 제한 확인

## 새 테스트 작성

`frontend/tests/e2e/`에 새 테스트 파일을 생성합니다:

```typescript
import { test, expect } from "@playwright/test";
import { login } from "../helpers/auth.helper";

test.describe("My Feature Tests", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "student");
  });

  test("should do something", async ({ page }) => {
    // 테스트 로직
  });
});
```

헬퍼 함수 사용:

```typescript
import { login, logout } from "../helpers/auth.helper";
import { TEST_USERS, TEST_PROBLEMS } from "../helpers/data.helper";

// 로그인
await login(page, "student");

// 테스트 데이터 사용
const user = TEST_USERS.student;
const problem = TEST_PROBLEMS.aPlusB;
```

## 테스트 디버깅

```bash
# UI 모드 (권장)
npm run test:e2e:ui

# 디버그 모드
npm run test:e2e:debug

# 특정 테스트 파일 실행
npx playwright test -c playwright.config.e2e.ts tests/e2e/auth.e2e.spec.ts

# 특정 테스트 케이스 실행
npx playwright test -c playwright.config.e2e.ts -g "should login as student"
```

## 자주 묻는 질문

### 테스트 환경이 시작되지 않음

다음을 확인하세요:

1. Docker가 실행 중입니까?
2. 포트 5174와 8001이 사용 가능합니까?
3. 서비스 로그 확인: `./frontend/scripts/e2e-env.sh logs`

### 테스트 데이터가 올바르지 않음

테스트 환경 리셋:

```bash
./frontend/scripts/e2e-env.sh reset
```

### 테스트가 느림

1. Docker에 충분한 리소스가 있는지 확인
2. `--workers=1`을 사용하여 병렬 테스트 방지
3. UI 로그인 대신 API 로그인 사용 고려 (더 빠름)

### CI/CD에서 테스트 실행 방법

```bash
# CI 환경 변수 설정
export CI=true

# 환경 시작
./frontend/scripts/e2e-env.sh start

# 테스트 실행
cd frontend && npm run test:e2e

# 정리
cd .. && ./frontend/scripts/e2e-env.sh stop
```

## 베스트 프랙티스

1. **데이터 격리**: 각 테스트 실행 전 환경을 리셋하여 테스트 독립성 보장
2. **대기 전략**: Playwright의 자동 대기 사용, `waitForTimeout` 피하기
3. **셀렉터 우선순위**:
   - `data-testid` 우선
   - 다음으로 시맨틱 셀렉터 (role, text)
   - CSS 클래스 피하기 (변경되기 쉬움)
4. **테스트 독립성**: 각 테스트는 다른 테스트에 의존하지 않고 독립적으로 실행 가능해야 함
5. **상태 정리**: `beforeEach`에서 인증 상태 정리

## 성능 최적화

1. **API 로그인 사용**: 로그인 플로우를 테스트하지 않는 경우 `loginViaAPI()`를 사용하여 속도 향상
2. **대기 시간 줄이기**: Playwright의 자동 대기 메커니즘 활용
3. **병렬 실행**: 신중하게 사용, 테스트 데이터 충돌이 없는지 확인
4. **스냅샷 테스트**: 안정된 UI에는 시각적 스냅샷 테스트 고려

## 유지보수

### 테스트 데이터 업데이트

`backend/apps/core/management/commands/seed_e2e_data.py`를 수정하여 테스트 데이터 구조 업데이트.

### 테스트 설정 업데이트

`frontend/playwright.config.e2e.ts`를 수정하여 테스트 동작 조정 (타임아웃, 재시도 횟수 등).

### 환경 설정 업데이트

`docker-compose.test.yml`을 수정하여 서비스 설정 조정 (포트, 환경 변수 등).

## 참고 자료

- [Playwright 문서](https://playwright.dev/)
- [Docker Compose 문서](https://docs.docker.com/compose/)
- [Django 테스트 베스트 프랙티스](https://docs.djangoproject.com/en/stable/topics/testing/)
