## 목표

본 문서는 현재 대회(Contest) 프론트엔드 아키텍처를 정리하고, 향후 새로운 대회 유형(예: `take_home`)을 추가할 때의 최소 변경 경로를 제공합니다. 이를 통해 시스템의 높은 확장성(개방 폐쇄 원칙, OCP 준수)을 확보하고, 공통 또는 특화된 판단 로직이 여러 곳에 흩어지는 것을 방지합니다.

## 현재 아키텍처

### 1) 대회 유형 모듈 계층 (Contest Type Module)

이는 프론트엔드 라우팅 및 렌더링 결정의 유일한 원천(Single Source of Truth)입니다. 특정 대회 유형에 전속된 모든 로직은 공통 컴포넌트나 정책에 하드코딩하는 대신, 해당 모듈 내에 캡슐화되어야 합니다.

- `modules/types.ts`
  - `ContestTypeModule` 규약 정의(`student` 및 `admin` 양측 인터페이스 포함).
- `modules/registry.ts`
  - `contestType -> module` 매핑 등록 센터.
- `modules/CodingModule.tsx`
- `modules/PaperExamModule.tsx`

**모듈의 역할:**

- **Student:**
  - 사용 가능한 탭 결정(`getTabs`).
  - 특화된 탭의 렌더링 로직 결정(`getTabRenderers`).
  - 응시 입구의 동적 라우트 결정(`getAnsweringEntryPath`).
- **Admin:**
  - 사용 가능한 패널 결정(`getAvailablePanels`).
  - 특정 패널의 렌더링 컴포넌트 결정(`getPanelRenderers`).
  - 편집기 종류(`editorKind`) 및 내보내기 옵션(`getExportTargets`) 결정.
  - JSON 가져오기 액션 표시 시점 결정(`shouldShowJsonActions`).

### 2) 렌더링 분배 계층 (Renderer Registries)

Dashboard 컨테이너가 지나치게 비대해지는 것을 방지하기 위해 Registry 패턴을 이용한 동적 렌더링 분배 방식을 채택하고 있습니다.

- **Student 탭 렌더링 (`StudentTabRendererRegistry.tsx`)**
  - `contentKind`를 대응하는 React 컴포넌트에 매핑합니다.
  - 모듈이 `getTabRenderers`를 통해 기본 컴포넌트를 오버라이드할 수 있도록 지원합니다.
- **Admin 패널 렌더링 (`AdminPanelRendererRegistry.tsx`)**
  - `AdminPanelId`를 대응하는 React 컴포넌트(`logs`, `participants` 등 공통 패널)에 매핑합니다.
  - 차별화된 패널(`problem_editor`, `statistics` 등)은 각 모듈이 `getPanelRenderers`를 통해 동적으로 제공합니다.
  - `screens/admin/AdminDashboardScreen.tsx`는 이제 순수한 껍데기 컨테이너가 되었으며, 더 이상 `switch(activePanel)`와 같은 하드코딩 로직을 포함하지 않습니다.

### 3) 공통 규칙 계층 (Domain Policy)

이 계층에는 특정 모듈의 타입 판단(예: `if (contestType === 'coding')`)을 포함하는 것이 엄격히 **금지**됩니다. 이 계층의 역할은 **모듈 간 공통 상태**와 **플러그인 방식의 동작(Plugin / Feature Flag)** 처리로 제한됩니다.

- `contestRuntimePolicy.ts`
  - 참가자 여부 판단(`isContestParticipant`).
  - 시험 상태 및 부정행위 방지 모니터링 판단(`isExamMonitoringActive`, `shouldWarnOnExit`).
  - *(참고: '제출(Submissions) 탭 표시 여부'와 같은 도메인 로직은 `CodingModule.tsx`로 이관되었으며, 공통 정책에 포함되지 않습니다.)*
- `contestRoutePolicy.ts`
  - 사전 체크 게이트(Precheck Gate) 차단 관리(`shouldRouteToPrecheck`).
  - 범용적인 응시 후 복귀 경로 계산(`getSubmitReviewBackPath`). 이는 모듈이 제공하는 `getAnsweringEntryPath`에 의존하여 동적 라우트의 정확성을 보장합니다.

## 확장 원칙 (준수 필수)

### A. 공통화해야 하며, 대회 유형별로 중복 구현하지 말 것
- **부정행위 방지 메커니즘 (Anti-Cheat / Precheck)**: 활성화 여부는 오직 `contest.cheatDetectionEnabled`라는 Feature Flag에만 의존해야 하며, **절대로** 특정 `contestType`에 결합해서는 안 됩니다.
- **Dashboard 컨테이너 골격**: `StudentDashboardLayout` 및 `AdminDashboardLayout`.
- **응시 라우트 계산**: `enterExamUseCase`를 사용하고 모듈에서 해석된 `answeringEntryPath`를 전달하여 시험 시작 프로세스를 통일합니다.

### B. 대회 모듈이 결정해야 함 (유형에 따라 다를 수 있음)
- 어떤 탭 / 패널을 표시할 것인가.
- 전용 패널의 React 컴포넌트(`getPanelRenderers`를 통해 주입).
- 응시 구역 진입 라우트 경로.

## 새로운 대회 유형 구현 체크리스트 (`take_home` 예시)

1. **모듈 생성**
   - `modules/TakeHomeModule.tsx` 생성.
   - `ContestTypeModule` 인터페이스를 구현하고, `getTabs` / `getAvailablePanels`에서 해당 모드에 필요한 목록을 반환합니다.
2. **모듈 등록**
   - `modules/registry.ts`에 `take_home: takeHomeContestModule` 추가.
3. **UI 커스텀 (필요한 경우)**
   - 전용 Admin 패널(예: `TaskEditorLayout`)을 구현하고 모듈의 `getPanelRenderers`에서 반환합니다.
   - 전용 응시 입구 경로(예: `/take-home/upload`)를 구현하고 `getAnsweringEntryPath`에서 반환합니다.
4. **부정행위 방지 Flag 확인**
   - 프론트엔드에 별도의 판단 로직을 추가할 필요가 없는지 확인합니다. 백엔드 `take_home` 모드에서 `cheatDetectionEnabled`를 켜지 않으면 부정행위 방지 시스템은 자동으로 숨겨집니다.
5. **테스트 보완**
   - `modules/registry.test.ts`에서 새 모듈의 로드 및 동작을 검증합니다.
   - `enterExam.usecase.test.ts` 및 `contestRoutePolicy.test.ts`에서 동적 라우트 검증을 보완합니다.

---
*부록: Admin 패널의 추가 모듈화(Phase 1) 및 정책/라우트 결합 해제(Phase 2)가 모두 완료되어, 시스템 확장을 위해 더 이상 중앙 집중식 Switch 문을 유지할 필요가 없습니다.*
