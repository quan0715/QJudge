# 教室總覽活動時間軸 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在教室 `OverviewPanel` 主欄實作「下一場未來活動」焦點區 + 僅含進行中／未來場次的稀疏時間軸；側欄只保留公告與學生待辦，並移除「近期活動」三卡。

**Architecture:** 將時間計算與 Hero／Timeline 篩選獨立為純函式模組（可注入 `now`，利於測試），與 `ClassroomContestCard` 使用相同的起訖後備規則（`contestStartTime`／`contestEndTime` 缺漏時 fallback `boundAt`）。UI 用 `@carbon/react`（`ClickableTile`、`Tag`、`Section` 或語意化標題）並重用 `formatDateTime`／`getContestState`（以 BoundContest 映射成 `{ status, startTime, endTime }`）。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、SCSS modules、react-i18next、既有 `@/i18n/dateUtils`。

**規格來源：** `docs/superpowers/specs/2026-04-05-classroom-overview-activity-timeline-design.md`

---

## 檔案對照表（會動到的路徑）

| 檔案 | 職責 |
|------|------|
| `frontend/src/features/classroom/domain/classroomActivityTimeline.ts` | 起訖解析、是否在時間軸／Hero 集合內、Hero 挑選、依「活動日」分組排序 |
| `frontend/src/features/classroom/domain/classroomActivityTimeline.test.ts` | 上述純函式單元測試（固定 `nowMs`） |
| `frontend/src/features/classroom/components/ClassroomActivityHero.tsx` | 焦點卡片（下一場未來；無未來時退化進行中） |
| `frontend/src/features/classroom/components/ClassroomActivityTimeline.tsx` | 稀疏日期節點 + 當日活動列；`aria` 與標題 |
| `frontend/src/features/classroom/components/ClassroomActivitySchedule.scss` | 版面間距、時間軸視覺（用 Carbon token，避免 `!important`） |
| `frontend/src/features/classroom/screens/panels/OverviewPanel.tsx` | 重排 `EntityOverviewFrame` 的 main／side；主欄掛 Hero+Timeline；側欄只公告+待辦 |
| `frontend/src/i18n/locales/*/classroom.json` | 新增文案鍵（zh-TW / en / ja / ko 同步） |
| `frontend/src/features/classroom/components/ClassroomActivitySchedule.stories.tsx` | Storybook：空狀態、僅進行中、僅未來、同日多場（可選，與 repo 既有 CSF3 一致） |

---

### Task 1: 純領域邏輯 + 單元測試（TDD）

**Files:**

- Create: `frontend/src/features/classroom/domain/classroomActivityTimeline.ts`
- Create: `frontend/src/features/classroom/domain/classroomActivityTimeline.test.ts`

- [ ] **Step 1: 建立測試檔（先寫會失敗的測試）**

```typescript
// frontend/src/features/classroom/domain/classroomActivityTimeline.test.ts
import { describe, expect, it } from "vitest";
import type { BoundContest } from "@/core/entities/classroom.entity";
import {
  buildTimelineDayGroups,
  pickHeroContest,
  contestBelongsOnActiveTimeline,
} from "./classroomActivityTimeline";

const baseContest = (overrides: Partial<BoundContest>): BoundContest => ({
  contestId: "c1",
  contestName: "Exam",
  contestDescription: "",
  contestStatus: "published",
  contestVisibility: "public",
  contestType: "coding",
  deliveryMode: "exam",
  contestStartTime: "2026-06-16T10:00:00.000Z",
  contestEndTime: "2026-06-16T12:00:00.000Z",
  contestOwnerUsername: "teacher",
  participantCount: 0,
  boundAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("classroomActivityTimeline", () => {
  const NOW = new Date("2026-06-15T12:00:00.000Z").getTime();

  it("pickHeroContest chooses earliest future start", () => {
    const contests = [
      baseContest({
        contestId: "a",
        contestStartTime: "2026-06-18T10:00:00.000Z",
        contestEndTime: "2026-06-18T12:00:00.000Z",
      }),
      baseContest({
        contestId: "b",
        contestStartTime: "2026-06-16T10:00:00.000Z",
        contestEndTime: "2026-06-16T12:00:00.000Z",
      }),
    ];
    expect(pickHeroContest(contests, NOW)?.contestId).toBe("b");
  });

  it("pickHeroContest falls back to in-progress when no future", () => {
    const contests = [
      baseContest({
        contestId: "live",
        contestStartTime: "2026-06-14T10:00:00.000Z",
        contestEndTime: "2026-06-20T12:00:00.000Z",
      }),
    ];
    expect(pickHeroContest(contests, NOW)?.contestId).toBe("live");
  });

  it("pickHeroContest returns null when all ended", () => {
    const contests = [
      baseContest({
        contestId: "old",
        contestStartTime: "2026-06-01T10:00:00.000Z",
        contestEndTime: "2026-06-10T12:00:00.000Z",
      }),
    ];
    expect(pickHeroContest(contests, NOW)).toBeNull();
  });

  it("contestBelongsOnActiveTimeline excludes ended", () => {
    const ended = baseContest({
      contestStartTime: "2026-06-01T10:00:00.000Z",
      contestEndTime: "2026-06-10T12:00:00.000Z",
    });
    expect(contestBelongsOnActiveTimeline(ended, NOW)).toBe(false);
  });

  it("buildTimelineDayGroups groups same local day and sorts", () => {
    const contests = [
      baseContest({
        contestId: "late",
        contestStartTime: "2026-06-16T14:00:00.000Z",
        contestEndTime: "2026-06-16T15:00:00.000Z",
      }),
      baseContest({
        contestId: "early",
        contestStartTime: "2026-06-16T09:00:00.000Z",
        contestEndTime: "2026-06-16T10:00:00.000Z",
      }),
      baseContest({
        contestId: "old",
        contestStartTime: "2026-06-01T10:00:00.000Z",
        contestEndTime: "2026-06-10T12:00:00.000Z",
      }),
    ];
    const groups = buildTimelineDayGroups(contests, NOW);
    expect(groups.length).toBe(1);
    expect(groups[0].contests.map((c) => c.contestId)).toEqual(["early", "late"]);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run:

```bash
cd /Users/quan/online_judge/frontend && npx vitest run src/features/classroom/domain/classroomActivityTimeline.test.ts
```

Expected: FAIL（模組不存在或函式未定義）

- [ ] **Step 3: 實作最小領域模組**

```typescript
// frontend/src/features/classroom/domain/classroomActivityTimeline.ts
import type { BoundContest } from "@/core/entities/classroom.entity";

export function getBoundContestTimeRange(contest: BoundContest): {
  startMs: number;
  endMs: number;
} {
  const startIso = contest.contestStartTime || contest.boundAt;
  const endIso = contest.contestEndTime || contest.boundAt;
  return {
    startMs: new Date(startIso).getTime(),
    endMs: new Date(endIso).getTime(),
  };
}

export function contestBelongsOnActiveTimeline(contest: BoundContest, nowMs: number): boolean {
  const { startMs, endMs } = getBoundContestTimeRange(contest);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false;
  if (nowMs >= endMs) return false;
  const isFuture = startMs > nowMs;
  const isInProgress = nowMs >= startMs && nowMs < endMs;
  return isFuture || isInProgress;
}

export function pickHeroContest(contests: BoundContest[], nowMs: number): BoundContest | null {
  const active = contests.filter((c) => contestBelongsOnActiveTimeline(c, nowMs));
  if (active.length === 0) return null;

  const future = active.filter((c) => getBoundContestTimeRange(c).startMs > nowMs);
  const pool = future.length > 0 ? future : active;

  return pool.reduce((best, c) => {
    const t = getBoundContestTimeRange(c).startMs;
    const bt = getBoundContestTimeRange(best).startMs;
    return t < bt ? c : best;
  });
}

export interface TimelineDayGroup {
  dateKey: string;
  contests: BoundContest[];
}

function localDateKeyFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildTimelineDayGroups(contests: BoundContest[], nowMs: number): TimelineDayGroup[] {
  const active = contests.filter((c) => contestBelongsOnActiveTimeline(c, nowMs));
  const byDay = new Map<string, BoundContest[]>();

  for (const c of active) {
    const { startMs } = getBoundContestTimeRange(c);
    const key = localDateKeyFromMs(startMs);
    const list = byDay.get(key) ?? [];
    list.push(c);
    byDay.set(key, list);
  }

  const groups: TimelineDayGroup[] = Array.from(byDay.entries()).map(([dateKey, list]) => ({
    dateKey,
    contests: [...list].sort(
      (a, b) => getBoundContestTimeRange(a).startMs - getBoundContestTimeRange(b).startMs
    ),
  }));

  groups.sort((a, b) => {
    const aMin = getBoundContestTimeRange(a.contests[0]).startMs;
    const bMin = getBoundContestTimeRange(b.contests[0]).startMs;
    return aMin - bMin;
  });

  return groups;
}
```

- [ ] **Step 4: 再跑測試**

Run:

```bash
cd /Users/quan/online_judge/frontend && npx vitest run src/features/classroom/domain/classroomActivityTimeline.test.ts
```

Expected: PASS（若本地時區導致 `buildTimelineDayGroups` 同日分組與預期不符，將測試資料改用與時區無關的斷言：例如只斷言排序 `early` 在 `late` 前、長度與排除 `old`）

- [ ] **Step 5: Commit**

```bash
cd /Users/quan/online_judge && git add frontend/src/features/classroom/domain/classroomActivityTimeline.ts frontend/src/features/classroom/domain/classroomActivityTimeline.test.ts
git commit -m "feat(classroom): add activity timeline domain helpers and tests"
```

---

### Task 2: Hero + Timeline 元件與樣式

**Files:**

- Create: `frontend/src/features/classroom/components/ClassroomActivityHero.tsx`
- Create: `frontend/src/features/classroom/components/ClassroomActivityTimeline.tsx`
- Create: `frontend/src/features/classroom/components/ClassroomActivitySchedule.scss`
- Modify: `frontend/src/features/classroom/screens/panels/OverviewPanel.tsx`

- [ ] **Step 1: 新增 Hero（展示 BoundContest、點擊導頁）**

以 `ClickableTile` 或 `Button` + `Stack` 呈現；時間顯示重用 `@/i18n/dateUtils` 的 `formatDateTime` 與 `DATE_FORMATS.SHORT`。狀態標籤：

```typescript
import { getContestState, getContestStateColor, getContestStateLabel } from "@/core/entities/contest.entity";

function contestStateFromBound(c: BoundContest): ReturnType<typeof getContestState> {
  return getContestState({
    status: c.contestStatus,
    startTime: c.contestStartTime || c.boundAt,
    endTime: c.contestEndTime || c.boundAt,
  });
}
```

Props 建議：`contest: BoundContest | null`、`onOpen: (id: string) => void`、`emptyTitle`／`emptySubtitle`、`createButton?`（`isPrivileged` 時顯示並呼叫父層 `onCreateExam`）。

- [ ] **Step 2: 新增 Timeline**

Props：`groups: TimelineDayGroup[]`、`onOpenContest: (id: string) => void`。每個日期節點使用 `<section>` 或 `<li>` 包裹；標題層級 `h3` 為日期列（或 `h4` 若頁面已有 `h2`），活動列用可點擊元素。同一日多場垂直排列。

- [ ] **Step 3: SCSS**

在 `ClassroomActivitySchedule.scss` 定義時間軸左側線條或間距（使用 `var(--cds-spacing-*)`）；主欄區塊 class 命名與現有 `classroom-admin-section` 並存或巢狀。

- [ ] **Step 4: 修改 `OverviewPanel.tsx`**

- `main`：包一層 fragment，順序為 `<ClassroomActivityHero ... />`、`<ClassroomActivityTimeline groups={buildTimelineDayGroups(classroom.contests, Date.now())} ... />`（`Date.now()` 僅在 render；若需凍結可後續抽 `useMemo` + 同一 tick）。
- `side`：維持 `AnnouncementSection`、`studentTodo`；**刪除**「近期活動」整段 `section`（含 `ContestCard` grid）。
- 將 `onCreateExam` 傳入 Hero 空狀態；`onNavigateExam` 傳給 Hero／Timeline。

- [ ] **Step 5: Lint + 測試**

Run:

```bash
cd /Users/quan/online_judge/frontend && npm run lint
cd /Users/quan/online_judge/frontend && npx vitest run src/features/classroom/domain/classroomActivityTimeline.test.ts
```

Expected: lint 無新增錯誤；vitest PASS。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/classroom/components/ClassroomActivityHero.tsx frontend/src/features/classroom/components/ClassroomActivityTimeline.tsx frontend/src/features/classroom/components/ClassroomActivitySchedule.scss frontend/src/features/classroom/screens/panels/OverviewPanel.tsx
git commit -m "feat(classroom): activity hero and sparse timeline on overview"
```

---

### Task 3: i18n 四語系

**Files:**

- Modify: `frontend/src/i18n/locales/zh-TW/classroom.json`
- Modify: `frontend/src/i18n/locales/en/classroom.json`
- Modify: `frontend/src/i18n/locales/ja/classroom.json`
- Modify: `frontend/src/i18n/locales/ko/classroom.json`

- [ ] **Step 1: 新增鍵（範例；實際英文／日／韓請對齊專案語氣）**

`activitySchedule.title`（教室活動／Activity schedule）、`activitySchedule.hero.next`（下一場活動／Next activity）、`activitySchedule.timeline.heading`（即將到來／Upcoming）、`activitySchedule.empty.title`、`activitySchedule.empty.subtitle`。

- [ ] **Step 2: 同步檢查**

Run:

```bash
cd /Users/quan/online_judge/frontend && npm run check:i18n
```

Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/i18n/locales/zh-TW/classroom.json frontend/src/i18n/locales/en/classroom.json frontend/src/i18n/locales/ja/classroom.json frontend/src/i18n/locales/ko/classroom.json
git commit -m "chore(i18n): classroom activity schedule strings"
```

---

### Task 4: Storybook（選做但規格建議）

**Files:**

- Create: `frontend/src/features/classroom/components/ClassroomActivitySchedule.stories.tsx`

- [ ] **Step 1: CSF3 stories** 使用 `Meta`／`StoryObj`，mock `BoundContest[]`，展示空狀態、僅進行中、多場未來、同日兩場。

- [ ] **Step 2: Build storybook（可選）**

```bash
cd /Users/quan/online_judge/frontend && npm run build-storybook
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/classroom/components/ClassroomActivitySchedule.stories.tsx
git commit -m "docs(storybook): classroom activity schedule states"
```

---

## Self-review（對照規格）

| 規格段落 | 對應任務 |
|----------|-----------|
| 主欄 Hero：下一場未來；無未來退化進行中 | Task 1 `pickHeroContest` + Task 2 Hero |
| 時間軸僅進行中＋未來、_sparse_ 日期節點 | Task 1 `buildTimelineDayGroups` + Task 2 Timeline |
| 起訖與卡片一致 | Task 1 `getBoundContestTimeRange` |
| 側欄公告＋待辦、移除近期三卡 | Task 2 `OverviewPanel` |
| 點擊進入競賽 | Task 2 `onNavigateExam` |
| a11y / i18n | Task 2 標題階層 + Task 3 |
| 測試建議 | Task 1 vitest；Task 4 Storybook |

**Placeholder 掃描：** 無 TBD；Storybook 標為選做但步驟完整。

**型別一致：** `TimelineDayGroup` 僅在 domain 定義一處；元件 import 同路徑。

---

## 交付後手動驗收

1. 以教師／學生帳進同一教室總覽：主欄可見 Hero + 時間軸；側欄無「近期活動」卡片。
2. 建立一場未來活動、一場進行中（時間需跨「現在」）— Hero 顯示下一場未來；時間軸兩者皆出現在對應日期節點。
3. 僅進行中、無未來 — Hero 顯示進行中場次。

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-05-classroom-overview-activity-timeline.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — 每個 Task 派一個新 subagent，Task 之間人工快速複核，迭代較快。

**2. Inline Execution** — 在本對話用 executing-plans 依步驟實作，批次 checkpoint。

**Which approach?**
