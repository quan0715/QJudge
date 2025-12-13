# E2E 테스트 가이드

본 문서는 프론트엔드 E2E 테스트 설정 및 실행 방법을 설명합니다.

## 개요

본 프로젝트는 Playwright를 사용하여 엔드투엔드(E2E) 테스트를 수행하며, Docker Compose로 완전한 테스트 환경을 제공합니다:

- 전용 테스트 데이터베이스 (PostgreSQL)
- 테스트용 Redis
- Django 백엔드 테스트 서비스
- Celery Worker (제출 처리용)
- React 프론트엔드 테스트 서비스
- 사전 입력된 테스트 데이터

## 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                    Playwright 테스트                     │
│              (Chrome + Safari 듀얼 브라우저)             │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Docker Compose 테스트 환경                  │
│              (docker-compose.test.yml)                  │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ frontend-test│  │ backend-test │  │ celery-test  │  │
│  │   :5174      │◄─┤   :8001      │◄─┤   Worker     │  │
│  └──────────────┘  └──────┬───────┘  └──────┬───────┘  │
│                           │                  │          │
│                   ┌───────▼────────┐ ┌──────▼───────┐  │
│                   │ postgres-test  │ │  redis-test  │  │
│                   │ (test_oj_e2e)  │ │   :6380      │  │
│                   └────────────────┘ └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 테스트 데이터

테스트 환경은 다음 테스트 데이터를 자동으로 입력합니다:

### 테스트 사용자

| 역할     | Email                | 비밀번호   | 용도             |
| -------- | -------------------- | ---------- | ---------------- |
| Admin    | admin@example.com    | admin123   | 관리자 테스트    |
| Teacher  | teacher@example.com  | teacher123 | 교사 기능 테스트 |
| Student  | student@example.com  | student123 | 학생 기능 테스트 |
| Student2 | student2@example.com | student123 | 다중 사용자 테스트|

### 테스트 문제

- **P001: A+B Problem** (쉬움) - 두 정수의 합 계산, 3개 테스트 케이스
- **P002: Hello World** (쉬움) - "Hello, World!" 출력, 1개 테스트 케이스
- **P003: Factorial** (보통) - 팩토리얼 계산, 3개 테스트 케이스

### 테스트 대회

- **E2E Test Contest** (진행중) - A+B Problem과 Hello World 포함, 참가 및 제출 가능
- **Upcoming Contest** (시작 전) - Factorial 포함, 참가 불가

## 빠른 시작

### 1. 의존성 설치

```bash
cd frontend
npm install
```

### 2. Playwright 브라우저 설치

```bash
# Chrome과 Safari 설치
npx playwright install chromium webkit
```

### 3. 테스트 환경 시작

```bash
# Docker Compose로 테스트 환경 시작
docker compose -f docker-compose.test.yml up -d

# 서비스 준비 대기 (약 30-60초)
# 다음 명령으로 상태 확인
docker compose -f docker-compose.test.yml ps
```

### 4. 테스트 실행

```bash
cd frontend

# 모든 E2E 테스트 실행 (환경 자동 감지)
npm run test:e2e

# Chrome만 테스트
npx playwright test -c playwright.config.e2e.ts --project=chromium

# Safari만 테스트
npx playwright test -c playwright.config.e2e.ts --project=webkit

# 특정 테스트 파일 실행
npx playwright test -c playwright.config.e2e.ts tests/e2e/auth.e2e.spec.ts

# 특정 테스트 케이스 실행
npx playwright test -c playwright.config.e2e.ts --grep "should login"

# UI 모드 (디버깅 시 권장)
npm run test:e2e:ui

# 디버그 모드
npm run test:e2e:debug

# 테스트 보고서 보기
npx playwright show-report playwright-report-e2e
```

### 5. 테스트 환경 중지

```bash
# 테스트 환경 중지 및 정리
docker compose -f docker-compose.test.yml down -v
```

## 테스트 환경 특징

### 스마트 환경 감지

테스트 프레임워크가 환경 상태를 자동 감지합니다:
- 환경이 실행 중이면 즉시 테스트 실행 (빠름)
- 환경이 실행 중이 아니면 Docker 환경 자동 시작 (로컬 개발)
- CI 환경에서는 사전 시작된 서비스의 준비를 대기

### 환경 유지

기본적으로 테스트 완료 후 Docker 환경이 유지됩니다:
- 테스트 빠른 재실행
- 수동 디버깅

환경을 정리하려면:
```bash
# 테스트 후 정리
E2E_CLEANUP=true npm run test:e2e

# 또는 수동 중지
docker compose -f docker-compose.test.yml down -v
```

## 테스트 구조

```
frontend/
├── tests/
│   ├── e2e/                      # E2E 테스트 파일
│   │   ├── auth.e2e.spec.ts      # 인증 테스트 (17개 테스트 케이스)
│   │   ├── problems.e2e.spec.ts  # 문제 목록 테스트 (8개 테스트 케이스)
│   │   ├── submission.e2e.spec.ts# 제출 테스트 (10개 테스트 케이스)
│   │   └── contest.e2e.spec.ts   # 대회 테스트
│   └── helpers/                  # 테스트 유틸리티
│       ├── auth.helper.ts        # 인증 헬퍼 함수
│       ├── data.helper.ts        # 테스트 데이터 상수
│       ├── setup.ts              # 글로벌 setup
│       └── teardown.ts           # 글로벌 teardown
├── playwright.config.e2e.ts      # Playwright E2E 설정
└── playwright-report-e2e/        # 테스트 보고서 출력 디렉토리
```

## 테스트 커버리지

### 인증 테스트 (auth.e2e.spec.ts) - 17개 테스트

#### 등록
- ✅ 새 사용자 등록 성공
- ✅ 비밀번호 불일치 시 오류 표시
- ✅ 이메일 중복 시 오류 표시

#### 로그인
- ✅ Student 로그인 성공
- ✅ Teacher 로그인 성공
- ✅ Admin 로그인 성공
- ✅ 잘못된 인증 정보로 오류 표시
- ✅ 잘못된 비밀번호로 오류 표시
- ✅ 빈 필드 처리

#### 로그아웃
- ✅ 로그아웃 성공 및 로그인 페이지로 리다이렉트

#### 세션 관리
- ✅ 대시보드 무단 접근 시 리다이렉트
- ✅ 페이지 새로고침 후 세션 유지
- ✅ 로그인 후 localStorage에 토큰 저장
- ✅ 로그아웃 후 토큰 삭제

#### 네비게이션
- ✅ 로그인 페이지에서 등록 페이지로 이동
- ✅ 등록 페이지에서 로그인 페이지로 이동
- ✅ 인증 없이 보호된 경로 접근 시 리다이렉트

### 문제 목록 테스트 (problems.e2e.spec.ts) - 8개 테스트

- ✅ 문제 목록 페이지 표시
- ✅ A+B Problem 표시
- ✅ Hello World Problem 표시
- ✅ 난이도 배지 표시
- ✅ 문제 클릭 시 상세 페이지로 이동
- ✅ 네비게이션 메뉴에서 문제 페이지 접근
- ✅ 테이블 형식으로 문제 표시
- ✅ 문제 시간 및 메모리 제한 표시

### 제출 테스트 (submission.e2e.spec.ts) - 10개 테스트

- ✅ 문제 상세 페이지 표시
- ✅ 문제 설명 및 테스트 케이스 표시
- ✅ 코딩 탭 표시
- ✅ 코드 제출 및 결과 확인
- ✅ 제출 기록 보기
- ✅ 제출 필터링
- ✅ 제출 상태 표시
- ✅ 제출 페이지에서 문제로 이동
- ✅ 제출 클릭 시 상세 정보 표시
- ✅ 문제로 이동하여 코딩 인터페이스 표시

### 대회 테스트 (contest.e2e.spec.ts)

- 대회 목록 표시
- 대회 상세 페이지
- 대회 참가
- 대회 문제 목록

## CI/CD 통합

### GitHub Actions 설정

테스트는 다음 조건에서 자동 트리거됩니다:
- `main` / `develop` 브랜치 푸시
- `frontend/tests/e2e/**`, `frontend/src/services/**` 등의 변경

### 테스트 흐름

CI에서의 테스트 흐름:
1. PostgreSQL과 Redis 시작
2. Backend 시작 및 헬스 체크 대기
3. API 통합 테스트 실행
4. Frontend 시작
5. E2E 테스트 순차 실행 (Auth → Problems → Submission → Contest)
6. 테스트 보고서 업로드

### 테스트 보고서 Artifacts

| Artifact 이름 | 내용 | 보관 기간 |
|---------------|------|-----------|
| `playwright-report-e2e` | HTML 테스트 보고서 | 30일 |
| `playwright-test-results` | 스크린샷, 동영상, 트레이스 | 14일 (실패 시만) |

### 수동 트리거

GitHub Actions 페이지에서 수동으로 트리거하고 테스트 유형을 선택할 수 있습니다:
- `api-only` - API 통합 테스트만 실행
- `e2e-only` - E2E 테스트만 실행
- `all` - 모든 테스트 실행

## 새 테스트 작성

`frontend/tests/e2e/`에 새 테스트 파일 생성:

```typescript
import { test, expect } from "@playwright/test";
import { login, clearAuth } from "../helpers/auth.helper";
import { TEST_USERS } from "../helpers/data.helper";

test.describe("My Feature Tests", () => {
  // 로그인 충돌 방지를 위해 serial 모드 사용
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    // 이전 인증 상태 초기화
    await page.goto("/login");
    await clearAuth(page);
    // 로그인
    await login(page, "student");
  });

  test("should do something", async ({ page }) => {
    // 테스트 로직
  });
});
```

### 헬퍼 함수 사용

```typescript
import { login, logout, clearAuth, isAuthenticated } from "../helpers/auth.helper";
import { TEST_USERS, TEST_PROBLEMS, TEST_CONTESTS } from "../helpers/data.helper";

// 다른 역할로 로그인
await login(page, "student");
await login(page, "teacher");
await login(page, "admin");

// 로그아웃
await logout(page);

// 테스트 데이터 사용
const user = TEST_USERS.student;  // { email, password, username, role }
const problem = TEST_PROBLEMS.aPlusB;  // { title, displayId, difficulty, slug }
```

## 테스트 디버깅

```bash
# UI 모드 (권장) - 시각적 테스트 실행
npm run test:e2e:ui

# 디버그 모드 - 단계별 실행
npm run test:e2e:debug

# 브라우저 창 표시
npx playwright test -c playwright.config.e2e.ts --headed

# 실패한 테스트 트레이스 보기
npx playwright show-trace test-results/xxx/trace.zip
```

## 문제 해결

### 테스트 환경 시작 실패

1. Docker가 실행 중인지 확인
2. 포트 5174와 8001이 사용 중이 아닌지 확인
3. 서비스 로그 확인:
   ```bash
   docker compose -f docker-compose.test.yml logs backend-test
   ```

### 테스트 데이터 오류

테스트 환경 재설정:
```bash
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml up -d
```

### 로그인 테스트 실패

올바른 selector를 사용하는지 확인. User Menu 버튼의 aria-label은 "使用者選單" 또는 "User Menu"입니다.

### API 요청 실패 (400 에러)

Docker 서비스 이름에 하이픈(`-`)을 사용하는지 확인. 예: `backend-test` (`backend_test`가 아님)

### 여러 테스트 스위트 동시 실행 시 실패

속도 제한이나 세션 충돌이 원인일 수 있습니다. 권장사항:
- `serial` 모드 사용
- `beforeEach`에서 `clearAuth()` 호출
- 테스트 스위트를 개별적으로 실행

## 모범 사례

1. **데이터 분리**: 테스트 사용자에 고유한 타임스탬프를 사용하여 데이터 충돌 방지
2. **대기 전략**: Playwright의 자동 대기 사용, `waitForTimeout` 피하기
3. **Selector 우선순위**:
   - `getByRole`, `getByText` 우선
   - 다음으로 `data-testid` 사용
   - 불안정한 CSS 클래스 피하기
4. **테스트 독립성**: `beforeEach`에서 상태 초기화
5. **에러 처리**: 가려진 요소에 `force: true` 사용
6. **Serial 모드**: `test.describe.configure({ mode: "serial" })`로 병렬 충돌 방지

## 참고 자료

- [Playwright 공식 문서](https://playwright.dev/)
- [Docker Compose 문서](https://docs.docker.com/compose/)
- [GitHub Actions 문서](https://docs.github.com/en/actions)
