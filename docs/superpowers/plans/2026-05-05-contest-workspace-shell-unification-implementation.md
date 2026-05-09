# 競賽 Layout 統一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 砍掉 `ContestLayout.tsx`（505 行），所有 contest 頁面（含 runtime / 非 runtime）統一走 `MainLayout` + `WorkspaceShell`，客製化由 `SideMenu` / `WorkspaceTopNav` / `UserMenu` 各自的 mode-aware 邏輯處理。

**Architecture:**
- 新增一個 URL-based hook `useContestRuntimeMode` 集中判定 runtime 狀態
- 新增 `RuntimeRouteWrapper` 包住 runtime route element，負責 ExamModeWrapper / 監考 modal / 關閉 right chat panel
- `SideMenu` / `WorkspaceTopNav` / `UserMenu` 直接呼叫該 hook 自我調整
- 合併路由：runtime 與非 runtime 共用 `ContestWorkspaceLayout`，整段放進 `MainLayout`

**Tech Stack:** React 18、react-router-dom、Carbon Design System、Vitest/RTL（測試）。

**參考文件：** `docs/superpowers/specs/2026-05-05-contest-workspace-shell-unification-design.md`

---

## Phase 1：共用偵測 + RuntimeRouteWrapper

### Task 1: `useContestRuntimeMode` hook

**Files:**
- Create: `frontend/src/features/contest/hooks/useContestRuntimeMode.ts`
- Create: `frontend/src/features/contest/hooks/useContestRuntimeMode.test.ts`

- [ ] **Step 1：寫失敗測試**

```typescript
// frontend/src/features/contest/hooks/useContestRuntimeMode.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useContestRuntimeMode } from './useContestRuntimeMode';

const wrap = (initialPath: string) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
  );
  return Wrapper;
};

describe('useContestRuntimeMode', () => {
  it.each([
    ['/classrooms/c1/contest/x1/solve', true],
    ['/classrooms/c1/contest/x1/solve/p1', true],
    ['/classrooms/c1/contest/x1', false],
    ['/classrooms/c1/contest/x1/admin', false],
    ['/dashboard', false],
    ['/classrooms/c1', false],
  ])('returns isRuntime=%s for %s', (path, expected) => {
    const { result } = renderHook(() => useContestRuntimeMode(), {
      wrapper: wrap(path),
    });
    expect(result.current.isRuntime).toBe(expected);
  });
});
```

- [ ] **Step 2：執行測試確認 fail**

```bash
cd frontend && npm test -- useContestRuntimeMode
```
Expected：fail（檔案尚不存在）。

- [ ] **Step 3：實作**

```typescript
// frontend/src/features/contest/hooks/useContestRuntimeMode.ts
import { useLocation } from 'react-router-dom';

const RUNTIME_REGEX = /^\/classrooms\/[^/]+\/contest\/[^/]+\/solve(?:\/|$)/;

export interface ContestRuntimeMode {
  isRuntime: boolean;
}

export const useContestRuntimeMode = (): ContestRuntimeMode => {
  const { pathname } = useLocation();
  return { isRuntime: RUNTIME_REGEX.test(pathname) };
};
```

- [ ] **Step 4：執行測試 pass**

```bash
cd frontend && npm test -- useContestRuntimeMode
```
Expected：6 tests pass。

- [ ] **Step 5：Commit**

```bash
git add frontend/src/features/contest/hooks/useContestRuntimeMode.ts frontend/src/features/contest/hooks/useContestRuntimeMode.test.ts
git commit -m "feat(contest): URL-based useContestRuntimeMode hook"
```

---

### Task 2: `RuntimeRouteWrapper` + `ContestRuntimeContext`

**Files:**
- Create: `frontend/src/features/contest/contexts/ContestRuntimeContext.tsx`
- Create: `frontend/src/features/contest/components/layout/RuntimeRouteWrapper.tsx`

- [ ] **Step 1：建立 ContestRuntimeContext**

```typescript
// frontend/src/features/contest/contexts/ContestRuntimeContext.tsx
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

interface ContestRuntimeContextValue {
  isRuntime: boolean;
}

const ContestRuntimeContext = createContext<ContestRuntimeContextValue>({
  isRuntime: false,
});

export const ContestRuntimeProvider = ({
  value,
  children,
}: {
  value: ContestRuntimeContextValue;
  children: ReactNode;
}) => (
  <ContestRuntimeContext.Provider value={value}>
    {children}
  </ContestRuntimeContext.Provider>
);

export const useContestRuntimeContext = () => useContext(ContestRuntimeContext);
```

- [ ] **Step 2：建立 RuntimeRouteWrapper**

開啟 `frontend/src/features/contest/components/layout/ContestLayout.tsx` 速覽 `useContestExamActions` / `ExamModeWrapper` / `ExamModeMonitorModal` / `ExamSubmissionProgressModal` / `useContestLayoutState` / `useContestTimers` 等使用方式作為參考，但**不從 ContestLayout import 任何東西**——RuntimeRouteWrapper 自行重建這些 hook 呼叫。

```tsx
// frontend/src/features/contest/components/layout/RuntimeRouteWrapper.tsx
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from '@carbon/react';
import { useTranslation } from 'react-i18next';

import { useDisablePanel } from '@/features/app/contexts/useDisablePanel';
import ExamModeWrapper from '@/features/contest/components/ExamModeWrapper';
import { ExamModeMonitorModal } from '@/features/contest/components/modals/ExamModeMonitorModal';
import ExamSubmissionProgressModal from '@/features/contest/components/exam/ExamSubmissionProgressModal';
import { useContestExamActions } from '@/features/contest/hooks/useContestExamActions';
import { useContestLayoutState } from '@/features/contest/hooks/useContestLayoutState';
import { ContestRuntimeProvider } from '@/features/contest/contexts/ContestRuntimeContext';

interface Props {
  children: ReactNode;
}

export const RuntimeRouteWrapper = ({ children }: Props) => {
  const { t } = useTranslation('contest');
  const { t: tc } = useTranslation('common');
  const {
    contestId,
    contest,
    hasEnded,
    refreshContest,
    navigate,
  } = useContestLayoutState();

  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [monitoringOpen, setMonitoringOpen] = useState(false);

  // 關閉右側 AI chat panel
  useDisablePanel('right');

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setErrorOpen(true);
  };

  const examActions = useContestExamActions({
    contest,
    contestId,
    hasEnded,
    refreshContest,
    navigate,
    messages: {
      joinError: t('error.joinFailed'),
      startError: t('error.startExamFailed'),
      endError: t('error.endExamFailed'),
      exitError: t('error.exitFailed'),
    },
    onError: showError,
  });

  const isContestParticipant = !!contest?.hasJoined;
  const examModeProps = {
    contestId: contestId || '',
    cheatDetectionEnabled: isContestParticipant && !!contest?.cheatDetectionEnabled,
    isExamMonitored: isContestParticipant && !!contest?.isExamMonitored,
    requiresFullscreen: isContestParticipant && !!contest?.requiresFullscreen,
    hasEnded,
    lockReason: contest?.lockReason,
    examStatus: contest?.examStatus,
    onRefresh: refreshContest,
  };

  return (
    <ContestRuntimeProvider value={{ isRuntime: true }}>
      <ExamModeWrapper {...examModeProps}>
        {children}
      </ExamModeWrapper>

      <ExamModeMonitorModal
        open={monitoringOpen}
        onRequestClose={() => setMonitoringOpen(false)}
      />

      <ExamSubmissionProgressModal
        state={examActions.submissionProgress.state}
        onRequestClose={examActions.submissionProgress.close}
      />

      <Modal
        open={errorOpen}
        modalHeading={tc('message.error')}
        passiveModal
        onRequestClose={() => setErrorOpen(false)}
      >
        <p>{errorMessage}</p>
      </Modal>
    </ContestRuntimeProvider>
  );
};

export default RuntimeRouteWrapper;
```

> 若 `useContestExamActions` 的 `messages` 欄位實際 key 與本檔不同，依該檔簽名調整；不要更動其 contract。

- [ ] **Step 3：型別檢查**

```bash
cd frontend && npm run -s typecheck
```
Expected：通過。

- [ ] **Step 4：Commit**

```bash
git add frontend/src/features/contest/contexts/ContestRuntimeContext.tsx frontend/src/features/contest/components/layout/RuntimeRouteWrapper.tsx
git commit -m "feat(contest): RuntimeRouteWrapper + ContestRuntimeContext"
```

---

## Phase 2：Top nav 與 UserMenu 適配

### Task 3: `WorkspaceTopNav` 加 runtime 鎖定 + ExamStatusBadge

**Files:**
- Modify: `frontend/src/features/app/components/workspace/WorkspaceTopNav.tsx`
- Modify: `frontend/src/features/app/components/workspace/WorkspaceTopNav.module.scss`

- [ ] **Step 1：在 WorkspaceTopNav 加 useContestRuntimeMode 與 ExamStatusBadge**

開啟 `frontend/src/features/app/components/workspace/WorkspaceTopNav.tsx`，於既有 imports 之後加入：

```tsx
import { useContestRuntimeMode } from '@/features/contest/hooks/useContestRuntimeMode';
import { useContestLayoutState } from '@/features/contest/hooks/useContestLayoutState';
import { useContestTimers } from '@/features/contest/hooks/useContestTimers';
import ExamStatusBadge from '@/features/contest/components/exam/ExamStatusBadge';
import { TimeDisplay } from '@/shared/components/dashboard';
```

於主元件函式內取得 runtime / contest 資料：

```tsx
const { isRuntime } = useContestRuntimeMode();
const { contest, contestId, refreshContest } = useContestLayoutState();
const { timeLeft, isCountdownToStart } = useContestTimers({
  contest,
  contestId,
  refreshContest,
});
```

- [ ] **Step 2：將 logo / 麵包屑 hyperlinks 套上 runtime 鎖定 className**

定位 `frontend/src/features/app/components/workspace/WorkspaceTopNav.tsx:153`（`<header>` 與 `styles.left`）。在現有的 logo / 麵包屑容器外層 className 後面附加 runtime modifier：

```tsx
<div
  className={[styles.context, isRuntime ? styles.contextLocked : '']
    .filter(Boolean)
    .join(' ')}
>
```

並對所有 `contextLink` 元素加 `aria-disabled={isRuntime}`、`tabIndex={isRuntime ? -1 : 0}`，並把 `onClick` 包裝為 `runtime 時 noop`：

```tsx
const handleContextClick = (next: () => void) =>
  isRuntime
    ? (e: React.SyntheticEvent) => { e.preventDefault(); }
    : next;
```

接著把所有 `onClick={someHandler}` 替換為 `onClick={handleContextClick(someHandler)}`。

- [ ] **Step 3：在 actions 區塊插入 ExamStatusBadge + 倒數**

定位 `<div className={styles.actions}>`（第 291 行附近），在 `<UserMenu />` 之前插入：

```tsx
{isRuntime && contest && (
  <>
    <ExamStatusBadge
      examStatus={contest.examStatus}
      cheatDetectionEnabled={contest.cheatDetectionEnabled}
      timeLeft={timeLeft}
      lockReason={contest.lockReason}
    />
    <div className={styles.runtimeTimer}>
      <TimeDisplay
        variant="header"
        value={isCountdownToStart ? `(待開始) ${timeLeft}` : timeLeft}
      />
    </div>
  </>
)}
```

- [ ] **Step 4：在 SCSS 加 contextLocked 與 runtimeTimer 樣式**

開啟 `frontend/src/features/app/components/workspace/WorkspaceTopNav.module.scss`，於檔案結尾新增：

```scss
.contextLocked {
  pointer-events: none;
  opacity: 0.7;
}

.runtimeTimer {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-variant-numeric: tabular-nums;
  margin-right: 0.5rem;
}
```

- [ ] **Step 5：型別檢查 + 視覺驗證**

```bash
cd frontend && npm run -s typecheck
```

```bash
cd frontend && npm run dev
```
開瀏覽器：1) 隨意 contest dashboard 頁面 navbar 與其他 app 頁面一致；2) 進入 `/solve` 後 logo / 麵包屑 hyperlinks 點擊無反應、ExamStatusBadge + 倒數顯示。

- [ ] **Step 6：Commit**

```bash
git add frontend/src/features/app/components/workspace/WorkspaceTopNav.tsx frontend/src/features/app/components/workspace/WorkspaceTopNav.module.scss
git commit -m "feat(top-nav): runtime lock + ExamStatusBadge in workspace top nav"
```

---

### Task 4: `UserMenu` settingsOnly 來源改為 hook

**Files:**
- Modify: `frontend/src/features/app/components/UserMenu.tsx`

- [ ] **Step 1：在 UserMenu 內讀 useContestRuntimeMode**

開啟 `frontend/src/features/app/components/UserMenu.tsx`，於既有 imports 後加入：

```tsx
import { useContestRuntimeMode } from '@/features/contest/hooks/useContestRuntimeMode';
```

修改 props 與內部邏輯：原 `settingsOnly = false` 仍保留作為「外部強制覆蓋」的 escape hatch，但若沒傳就讀 hook：

```tsx
export const UserMenu: React.FC<UserMenuProps> = ({
  settingsOnly,
  ...rest
}) => {
  const { isRuntime } = useContestRuntimeMode();
  const effectiveSettingsOnly = settingsOnly ?? isRuntime;

  // ... 原本檔案內所有 `settingsOnly` 的引用都換為 `effectiveSettingsOnly`
};
```

實作上把所有 `settingsOnly` 內部 reference（檔內第 81 行附近的條件分支等）統一替換為 `effectiveSettingsOnly`。

- [ ] **Step 2：型別檢查 + 手動驗證**

```bash
cd frontend && npm run -s typecheck
```

dev 開啟，driver flow：1) /dashboard 點頭像 → 完整選單；2) `/classrooms/.../contest/.../solve` 點頭像 → 只剩設定 / 登出。

- [ ] **Step 3：Commit**

```bash
git add frontend/src/features/app/components/UserMenu.tsx
git commit -m "feat(user-menu): auto settingsOnly during contest runtime"
```

---

## Phase 3：SideMenu 兩個 contest mode

### Task 5: `SideMenuContestIdleSection`

**Files:**
- Create: `frontend/src/features/app/components/SideMenuContestIdleSection.tsx`

- [ ] **Step 1：實作**

```tsx
// frontend/src/features/app/components/SideMenuContestIdleSection.tsx
import { Link, useLocation, useParams } from 'react-router-dom';
import { Home, ArrowLeft } from '@carbon/icons-react';

interface Props {
  classroomId: string;
  contestId: string;
  compact?: boolean;
}

export const SideMenuContestIdleSection = ({ classroomId, contestId, compact }: Props) => {
  const { pathname } = useLocation();
  const dashboardPath = `/classrooms/${classroomId}/contest/${contestId}`;
  const isDashboard = pathname === dashboardPath;
  const classroomPath = `/classrooms/${classroomId}`;

  const itemBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: compact ? '0.5rem' : '0.75rem 1rem',
    borderRadius: '0.25rem',
    color: 'var(--cds-text-primary)',
    textDecoration: 'none',
  };

  return (
    <nav aria-label="Contest navigation" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <Link to={classroomPath} style={itemBase}>
        <ArrowLeft size={20} />
        {!compact && <span>返回教室</span>}
      </Link>
      <Link
        to={dashboardPath}
        style={{
          ...itemBase,
          background: isDashboard ? 'var(--cds-layer-accent)' : 'transparent',
          fontWeight: isDashboard ? 600 : 400,
        }}
        aria-current={isDashboard ? 'page' : undefined}
      >
        <Home size={20} />
        {!compact && <span>競賽主頁</span>}
      </Link>
    </nav>
  );
};

export default SideMenuContestIdleSection;
```

- [ ] **Step 2：型別檢查 + Commit**

```bash
cd frontend && npm run -s typecheck
git add frontend/src/features/app/components/SideMenuContestIdleSection.tsx
git commit -m "feat(side-menu): contest idle section with back-to-classroom"
```

---

### Task 6: `SideMenuContestRuntimeSection`

**Files:**
- Create: `frontend/src/features/app/components/SideMenuContestRuntimeSection.tsx`

- [ ] **Step 1：實作**

```tsx
// frontend/src/features/app/components/SideMenuContestRuntimeSection.tsx
import { useNavigate, useParams } from 'react-router-dom';
import { ContentSwitcher, Switch, Tag } from '@carbon/react';
import { Checkmark, CircleDash, IncompleteCancel } from '@carbon/icons-react';
import { useContest } from '@/features/contest/contexts/ContestContext';

interface Props {
  classroomId: string;
  contestId: string;
  /** 'solve' | 'dashboard' — current sidebar tab */
  activeTab: 'solve' | 'dashboard';
  /** 已選的 problem id，用以高亮 */
  activeProblemId?: string;
  compact?: boolean;
}

const statusIcon = (status: 'done' | 'partial' | 'untouched') => {
  if (status === 'done') return <Checkmark size={16} aria-label="已作答" />;
  if (status === 'partial') return <IncompleteCancel size={16} aria-label="進行中" />;
  return <CircleDash size={16} aria-label="未作答" />;
};

export const SideMenuContestRuntimeSection = ({
  classroomId,
  contestId,
  activeTab,
  activeProblemId,
  compact,
}: Props) => {
  const navigate = useNavigate();
  const { contest } = useContest();
  const dashboardPath = `/classrooms/${classroomId}/contest/${contestId}`;
  const solvePath = `/classrooms/${classroomId}/contest/${contestId}/solve`;

  const handleTabChange = ({ name }: { name: string | number }) => {
    if (name === 'dashboard') navigate(dashboardPath);
    else navigate(solvePath);
  };

  const problems = contest?.problems ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {!compact && (
        <ContentSwitcher
          selectedIndex={activeTab === 'solve' ? 0 : 1}
          onChange={handleTabChange}
          size="sm"
        >
          <Switch name="solve" text="Solve" />
          <Switch name="dashboard" text="Dashboard" />
        </ContentSwitcher>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {problems.length === 0 ? (
          <p style={{ color: 'var(--cds-text-secondary)', fontSize: '0.75rem' }}>
            {compact ? '' : '尚無題目'}
          </p>
        ) : (
          problems.map((p) => {
            const isActive = p.problemId === activeProblemId;
            const status =
              p.userStatus === 'completed'
                ? 'done'
                : p.userStatus === 'in_progress'
                  ? 'partial'
                  : 'untouched';
            const target = `/classrooms/${classroomId}/contest/${contestId}/solve/${p.problemId}`;
            return (
              <button
                key={p.problemId}
                type="button"
                onClick={() => navigate(target)}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: compact ? '0.5rem' : '0.5rem 0.75rem',
                  borderRadius: '0.25rem',
                  background: isActive ? 'var(--cds-layer-accent)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  color: 'var(--cds-text-primary)',
                }}
              >
                {statusIcon(status)}
                {!compact && (
                  <>
                    <span style={{ flexShrink: 0, fontWeight: 600 }}>{p.label}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.title}
                    </span>
                  </>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default SideMenuContestRuntimeSection;
```

> `contest.problems` / `userStatus` 的實際欄位名稱請對照 `core/entities/contest.entity.ts` 的 `ContestProblemSummary`；若 status 欄位不是 `userStatus` 就調整為實際 key，但**不改動 entity 定義**。

- [ ] **Step 2：型別檢查 + Commit**

```bash
cd frontend && npm run -s typecheck
git add frontend/src/features/app/components/SideMenuContestRuntimeSection.tsx
git commit -m "feat(side-menu): contest runtime section with tabs and problem list"
```

---

### Task 7: `SideMenu` 接上 contest idle / runtime 分支

**Files:**
- Modify: `frontend/src/features/app/components/SideMenu.tsx`

- [ ] **Step 1：在 SideMenu 內 imports 區塊加入新元件與 hook**

```tsx
import { useContestRuntimeMode } from '@/features/contest/hooks/useContestRuntimeMode';
import SideMenuContestIdleSection from './SideMenuContestIdleSection';
import SideMenuContestRuntimeSection from './SideMenuContestRuntimeSection';
```

- [ ] **Step 2：在 SideMenu 主函式內加上 contest path 偵測**

於既有取得 `pathname` 之後，新增：

```tsx
const contestMatch = useMemo(
  () => pathname.match(/^\/classrooms\/([^/]+)\/contest\/([^/]+)/),
  [pathname],
);
const inAdminPath = /^\/classrooms\/[^/]+\/contest\/[^/]+\/admin/.test(pathname);
const { isRuntime } = useContestRuntimeMode();
const inContestIdle = !!contestMatch && !inAdminPath && !isRuntime;
const inContestRuntime = !!contestMatch && isRuntime;
const classroomId = contestMatch?.[1] ?? '';
const contestId = contestMatch?.[2] ?? '';
const activeProblemId = useMemo(() => {
  const m = pathname.match(/\/solve\/([^/]+)/);
  return m?.[1];
}, [pathname]);
```

> `useMemo` 已經是 SideMenu 內部使用模式，沿用即可。

- [ ] **Step 3：在 `SideMenu` 既有 render flow 中插入 idle / runtime 分支**

定位 SideMenu 內目前回傳的 nav 區塊（`<div className={styles.nav}>` 等），改為早期返回：

```tsx
if (inContestRuntime) {
  return (
    <SideMenuContestRuntimeSection
      classroomId={classroomId}
      contestId={contestId}
      activeTab="solve"
      activeProblemId={activeProblemId}
      compact={compact}
    />
  );
}

if (inContestIdle) {
  return (
    <SideMenuContestIdleSection
      classroomId={classroomId}
      contestId={contestId}
      compact={compact}
    />
  );
}

// 既有原始 SideMenu 內容（教室列表、提交、AI 等）
return ( /* ... */ );
```

> 確切插入位置：早於既有「角色 / 路徑」分支返回；若 SideMenu 主結構是 `<aside>...</aside>`，可在頂層 `<aside>` 內以條件 children 的方式加分支，避免重複包 `<aside>`。

- [ ] **Step 4：型別檢查 + 視覺驗證**

```bash
cd frontend && npm run -s typecheck
```

dev 啟動，逐一檢查：
- /dashboard：原 SideMenu（教室、題目、提交...）
- /classrooms/cid/contest/cid（idle）：sidebar 只有「返回教室 / 競賽主頁」
- /classrooms/cid/contest/cid/admin：原 admin sidebar 不變
- /classrooms/cid/contest/cid/solve（runtime）：sidebar 是 ContentSwitcher + 題目列表

- [ ] **Step 5：Commit**

```bash
git add frontend/src/features/app/components/SideMenu.tsx
git commit -m "feat(side-menu): switch to contest idle/runtime sections by URL"
```

---

## Phase 4：路由合併

### Task 8: `routes.tsx` 合併

**Files:**
- Modify: `frontend/src/features/contest/routes.tsx`
- Modify: `frontend/src/features/contest/index.ts`（若有 export `classroomContestRuntimeRoutes`）

- [ ] **Step 1：重寫 routes.tsx 的 contest 主路由**

```tsx
// frontend/src/features/contest/routes.tsx
import { lazy, Suspense } from 'react';
import { Route } from 'react-router';
import ContestWorkspaceLayout from './components/layout/ContestWorkspaceLayout';
import RuntimeRouteWrapper from './components/layout/RuntimeRouteWrapper';
import { ContestProvider } from './contexts/ContestContext';
import ContestDashboardScreen from './screens/ContestDashboardScreen';
import ContestSolveScreen from './screens/ContestSolveScreen';
import ContestPracticeScreen from './screens/ContestPracticeScreen';

const AdminDashboardScreen = lazy(() => import('./screens/admin/AdminDashboardScreen'));
const StudentExamDemoScreen = lazy(() => import('./screens/examDemo/StudentExamDemoScreen'));
const ExamPrecheckScreen = lazy(() => import('./screens/paperExam/ExamPrecheckScreen'));

/**
 * Classroom Contest 主路由（dashboard + runtime 共用）。
 * 在 App.tsx 必須掛在 <MainLayout> 之下。
 */
export const classroomContestRoutes = (
  <Route
    path="/classrooms/:classroomId/contest/:contestId"
    element={<ContestWorkspaceLayout />}
  >
    <Route index element={<ContestDashboardScreen />} />
    <Route
      path="solve"
      element={
        <RuntimeRouteWrapper>
          <ContestSolveScreen />
        </RuntimeRouteWrapper>
      }
    />
    <Route
      path="solve/:problemId"
      element={
        <RuntimeRouteWrapper>
          <ContestSolveScreen />
        </RuntimeRouteWrapper>
      }
    />
  </Route>
);

/**
 * Classroom Contest Admin Dashboard — 獨立全頁面
 */
export const classroomContestAdminRoute = (
  <Route
    path="/classrooms/:classroomId/contest/:contestId/admin"
    element={<Suspense fallback={null}><AdminDashboardScreen /></Suspense>}
  />
);

/**
 * Classroom Exam Preview — 獨立全頁面
 */
export const classroomExamPreviewRoute = (
  <Route
    path="/classrooms/:classroomId/contest/:contestId/exam-preview"
    element={<Suspense fallback={null}><StudentExamDemoScreen /></Suspense>}
  />
);

/**
 * Classroom Practice — 獨立全頁面
 */
export const classroomPracticeRoute = (
  <Route
    path="/classrooms/:classroomId/contest/:contestId/practice"
    element={
      <ContestProvider>
        <ContestPracticeScreen />
      </ContestProvider>
    }
  />
);

/**
 * Classroom Exam Precheck — 獨立全頁面
 */
export const classroomExamPrecheckRoute = (
  <Route
    path="/classrooms/:classroomId/contest/:contestId/exam-precheck"
    element={
      <ContestProvider>
        <Suspense fallback={null}><ExamPrecheckScreen /></Suspense>
      </ContestProvider>
    }
  />
);
```

> **變動重點**：移除 `classroomContestDetailRoutes` 與 `classroomContestRuntimeRoutes`，合併為單一 `classroomContestRoutes`；移除 `ContestLayout` 的 import。

- [ ] **Step 2：同步 `frontend/src/features/contest/index.ts`**

把舊 exports（`classroomContestDetailRoutes`、`classroomContestRuntimeRoutes`）替換為 `classroomContestRoutes`。

```bash
grep -n "classroomContestDetailRoutes\|classroomContestRuntimeRoutes" frontend/src/features/contest/index.ts
```

把找到的 export 名稱改為 `classroomContestRoutes`，import 對齊。

- [ ] **Step 3：Commit**

```bash
git add frontend/src/features/contest/routes.tsx frontend/src/features/contest/index.ts
git commit -m "refactor(contest): merge runtime+detail routes into one branch"
```

---

### Task 9: `App.tsx` 把 contest 路由放進 MainLayout

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1：修改 contest 路由掛載位置**

定位 `frontend/src/App.tsx:148`（既有 `<Route element={<MainLayout />}>` 區塊）與 contest 路由相關片段。把目前分屬 MainLayout 內、外兩處的 contest 路由統一放進 MainLayout 下：

搜尋現有：
```bash
grep -n "classroomContestDetailRoutes\|classroomContestRuntimeRoutes\|classroomContestRoutes" frontend/src/App.tsx
```

把舊的 `{classroomContestDetailRoutes}`（在 MainLayout 內）與 `{classroomContestRuntimeRoutes}`（在 MainLayout 外）替換為**單一引用** `{classroomContestRoutes}`，且**只放在 `<Route element={<MainLayout />}>` 之內**。

對應 imports：

```diff
- import {
-   classroomContestDetailRoutes,
-   classroomContestRuntimeRoutes,
-   classroomContestAdminRoute,
-   classroomExamPreviewRoute,
-   classroomPracticeRoute,
-   classroomExamPrecheckRoute,
- } from '@/features/contest';
+ import {
+   classroomContestRoutes,
+   classroomContestAdminRoute,
+   classroomExamPreviewRoute,
+   classroomPracticeRoute,
+   classroomExamPrecheckRoute,
+ } from '@/features/contest';
```

> 不要碰其他 admin / preview / practice / precheck route 的位置（依然獨立於 MainLayout 之外）。

- [ ] **Step 2：型別檢查 + dev server**

```bash
cd frontend && npm run -s typecheck && npm run dev
```

開瀏覽器逐一驗證：
- /classrooms/cid/contest/cid 渲染正常（與其他 dashboard 同 layout）
- /classrooms/cid/contest/cid/solve 渲染正常（runtime sidebar + locked navbar）
- /classrooms/cid/contest/cid/admin 渲染正常（不在 MainLayout 下，自帶 layout）
- /classrooms/cid/contest/cid/exam-precheck 渲染正常（不在 MainLayout 下）

- [ ] **Step 3：Commit**

```bash
git add frontend/src/App.tsx
git commit -m "refactor(app): mount contest routes under MainLayout"
```

---

## Phase 5：清理

### Task 10: 刪除 `ContestLayout`

**Files:**
- Delete: `frontend/src/features/contest/components/layout/ContestLayout.tsx`
- Delete: `frontend/src/features/contest/components/layout/ContestLayout.module.scss`

- [ ] **Step 1：搜尋殘餘 import**

```bash
grep -rn "ContestLayout\b\|ContestLayout\.module\|from .*ContestLayout" frontend/src --include="*.ts" --include="*.tsx" | grep -v ContestLayoutHeaderSlotContext | grep -v ContestWorkspaceLayout | grep -v node_modules
```

對每個 hit 檢查並修改/刪除引用。預期殘餘只在已修改的檔案內。

- [ ] **Step 2：刪檔**

```bash
rm frontend/src/features/contest/components/layout/ContestLayout.tsx
rm frontend/src/features/contest/components/layout/ContestLayout.module.scss
```

- [ ] **Step 3：型別檢查 + lint**

```bash
cd frontend && npm run -s typecheck && npm run -s lint
```
Expected：通過。

- [ ] **Step 4：Commit**

```bash
git add -A frontend/src/features/contest/components/layout/
git commit -m "chore(contest): remove obsolete ContestLayout"
```

---

### Task 11: i18n 與 E2E 驗收

**Files:**
- Modify: `frontend/src/locales/*` 或對應 i18n 檔（依專案結構）

- [ ] **Step 1：i18n 檢查 / 同步**

```bash
cd frontend && npm run sync:i18n && npm run check:i18n
```
Expected：通過；本次未新增字串，預期無變動或僅顯示未使用提示。

- [ ] **Step 2：執行所有單元測試**

```bash
cd frontend && npm test
```
Expected：所有測試通過，特別是 `useContestRuntimeMode.test.ts`。

- [ ] **Step 3：手動 E2E 驗收清單**

依序在瀏覽器逐一驗證：

- [ ] 學生登入 → /dashboard：sidebar 是原本的（教室、題目、提交...），navbar 正常
- [ ] 點進 /classrooms/cid/contest/cid：sidebar 切為「返回教室 / 競賽主頁」；navbar 仍可互動；右側 chat panel 可開啟
- [ ] 點 navbar 教室 / contest 麵包屑可切換
- [ ] 進入 /solve：
  - sidebar 切為 ContentSwitcher（Solve / Dashboard）+ 題目列表
  - navbar logo / 麵包屑點擊無反應（pointer-events: none）
  - navbar 顯示 ExamStatusBadge 與倒數
  - UserMenu 點開只剩設定 / 登出
  - 右側 chat panel 不可開啟（FAB / 按鈕 disable）
- [ ] sidebar 點 Dashboard tab → 切回 contest dashboard URL，sidebar 自動回 idle 模式，右側 chat 可開
- [ ] sidebar 點 Solve tab 或題目項 → navigate 至 `/solve` 或 `/solve/{id}`
- [ ] 視覺：navbar / sidebar 與其他 app 頁面（dashboard / classroom）視覺一致（顏色、border、字級、間距）
- [ ] 行動裝置：sidebar 在 contest idle 與 runtime 模式都可透過 drawer 開啟，內容正確
- [ ] 競賽結束（手動把 end_time 改為過去）：runtime sidebar 仍能瀏覽歷史；提交按鈕 disable

- [ ] **Step 4：Commit i18n 變更（若有）**

```bash
git add -A
git diff --cached --stat
git commit -m "chore(contest): finalize layout unification verification"
```

---

## 自我審查

### 1. Spec 覆蓋

- §A 架構：runtime/非 runtime 共用 `ContestWorkspaceLayout` → Task 8
- §B `RuntimeRouteWrapper` → Task 2
- §C `SideMenu` 兩個 mode → Task 5、6、7
- §D `WorkspaceTopNav` runtime 鎖定 + ExamStatus → Task 3
- §E `UserMenu` settingsOnly → Task 4
- §F Runtime 偵測 → Task 1
- §G 路由調整 → Task 8、9
- 元件結構 / 刪除清單 → Task 10
- 測試重點 → Task 1（unit）、Task 11（E2E）

### 2. Placeholder 掃描

- Task 7 內提到「依 SideMenu 主結構決定條件 children 包裝方式」—— 是合理的實作彈性註記，不是 TBD
- Task 6 註記 `userStatus` 欄位需對照 entity —— 這是已知 entity 的屬性查詢，動作明確
- Task 3 步驟 2 對 `onClick` 包裝邏輯給出完整 helper 函式，無 TBD
- 無 TBD / TODO / 「實作 later」字樣

### 3. 型別 / 命名一致性

- `useContestRuntimeMode` 回傳 `{ isRuntime: boolean }`，Task 1、3、4、7 一致
- `RuntimeRouteWrapper` 接受 `{ children }`，Task 2、8 一致
- `ContestRuntimeProvider` value 形狀 `{ isRuntime: boolean }`，Task 2 內一致
- `SideMenuContestIdleSection` / `SideMenuContestRuntimeSection` 命名與 file path 在 Task 5、6、7 一致
- `classroomContestRoutes` 名稱在 Task 8、9、index.ts 一致
- 路徑 regex `/^\/classrooms\/[^/]+\/contest\/[^/]+\/solve(?:\/|$)/` 在 Task 1 與 Task 7 一致
