# 競賽準備階段管理總覽 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 教師端總覽在競賽尚未開考時，改為顯示「還缺什麼、下一步按哪裡」的準備型畫面，並讓「發布競賽」成為畫面上的主要動作。

**Architecture:** `AdminOverviewScreen` 依 `getContestState()` 分歧：draft 與 upcoming 走新的 `AdminPreparationCommandCenter`，running / ended / archived 維持現有 `AdminOverviewCommandCenter`。準備型畫面沿用 `AdminSegmentedDashboard` 的 header / primary / side 骨架，資料由 screen 呼叫 `buildAdminPreparationOverview()` 算好後注入，元件只負責渲染。

**Tech Stack:** React 18 + TypeScript、Carbon Design System、vitest + @testing-library/react、react-i18next（zh-TW / en / ja / ko）。

**Spec:** `docs/superpowers/specs/2026-09-07-contest-preparation-overview-design.md`

---

## 執行環境

所有前端測試在 test compose 的 `frontend-test` 服務內執行。開工前先啟動：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test up -d frontend-test
```

單一測試檔的執行格式（後續步驟都用這個形式）：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npx vitest run <path>
```

**注意：** dev 與 test compose 共用同一個 project name `online_judge`。收工要停 test 時，必須明確列出 test-only 服務，否則會停掉正在跑的 dev 容器：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test stop \
  backend-test frontend-test pgbouncer-test postgres-test redis-test \
  celery-test celery-high-test fake-ai-adapters
```

絕對不要對 test 下 `down`。

---

## 檔案結構

新增：

| 檔案 | 責任 |
| --- | --- |
| `frontend/src/features/contest/components/admin/PreparationChecklist.tsx` | 純展示：把算好的 checklist items 渲染成清單列 |
| `frontend/src/features/contest/components/admin/PreparationChecklist.module.scss` | 上者樣式 |
| `frontend/src/features/contest/components/admin/PreparationChecklist.test.tsx` | 排序與等級樣式的測試 |
| `frontend/src/features/contest/components/admin/AdminPreparationCommandCenter.tsx` | 準備型畫面外殼：組 `AdminSegmentedDashboard` 的 header / primary / side |
| `frontend/src/features/contest/components/admin/AdminPreparationCommandCenter.module.scss` | 上者樣式 |
| `frontend/src/features/contest/components/admin/AdminPreparationCommandCenter.test.tsx` | draft / upcoming 變體與側欄動作的測試 |

修改：

| 檔案 | 修改內容 |
| --- | --- |
| `frontend/src/features/contest/screens/admin/panels/adminOverviewDashboard.model.ts` | 新增 `buildAdminPreparationOverview()` 與相關型別；刪除 `buildAdminPreparationDashboard()` |
| `frontend/src/features/contest/screens/admin/panels/adminOverviewDashboard.model.test.ts` | 新增前者測試；刪除後者測試 |
| `frontend/src/features/contest/modules/types.ts` | 新增 `ContestSettingsSectionId`；`AdminPanelProps.onOpenSettings` 改為可帶 section |
| `frontend/src/features/contest/components/admin/settings/ContestSettingsModal.tsx` | 新增 `initialActiveId` prop 並透傳給 `SettingsModal` |
| `frontend/src/features/contest/screens/admin/panels/AdminContestSettingsScreen.tsx` | `ContestSettingsOverlay` 新增 `initialSection` prop |
| `frontend/src/features/contest/screens/admin/AdminDashboardScreen.tsx` | 以 state 保存要開啟的 settings section |
| `frontend/src/features/contest/screens/admin/panels/AdminOverviewScreen.tsx` | 狀態分歧、發布 / 退回草稿 handler |
| `frontend/src/i18n/locales/{zh-TW,en,ja,ko}/contest.json` | 新增 `adminOverview.preparation.*` |

刪除：`DraftChecklistPanel.*`、`AdminPreparationDashboard.*`、`OverviewActionWidgets.*`、`OverviewInsightsPanel.*`（各含 `.tsx` / `.module.scss` / `.test.tsx`）。

---

## Task 1: 設定 modal 可指定初始分頁

`SettingsModal` 已經支援 `initialActiveId`（`shared/ui/modal/SettingsModal.tsx:17`），但 `ContestSettingsModal` 沒有把它接上。這個 task 把整條 prop 鏈接通，讓後續「點發布 → 直接開時間設定」有路可走。

**Files:**
- Modify: `frontend/src/features/contest/modules/types.ts`
- Modify: `frontend/src/features/contest/components/admin/settings/ContestSettingsModal.tsx`
- Modify: `frontend/src/features/contest/screens/admin/panels/AdminContestSettingsScreen.tsx`
- Modify: `frontend/src/features/contest/screens/admin/AdminDashboardScreen.tsx`
- Test: `frontend/src/features/contest/components/admin/settings/ContestSettingsModal.test.tsx`

- [ ] **Step 1: 寫失敗的測試**

在 `ContestSettingsModal.test.tsx` 末尾新增（沿用該檔既有的 `renderModal` helper 與 mock；若 helper 名稱不同，改用該檔既有的 render 方式並傳入 `initialActiveId="cheatDetection"`）：

```tsx
it("opens the requested section when initialActiveId is given", () => {
  renderModal({ initialActiveId: "cheatDetection" });

  expect(
    screen.getByRole("heading", { name: /防作弊|Cheat|不正/ }),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npx vitest run src/features/contest/components/admin/settings/ContestSettingsModal.test.tsx
```

Expected: FAIL —— `initialActiveId` 不是 `ContestSettingsModal` 的 prop，modal 仍開在第一個分頁 `general`。

- [ ] **Step 3: 新增 section 型別**

在 `frontend/src/features/contest/modules/types.ts` 的 `AdminPanelId` 定義之後新增：

```ts
export type ContestSettingsSectionId =
  | "general"
  | "access"
  | "display"
  | "cheatDetection"
  | "integrity";
```

並把同檔 `AdminPanelProps` 裡的 `onOpenSettings` 改成：

```ts
  onOpenSettings?: (section?: ContestSettingsSectionId) => void;
```

- [ ] **Step 4: ContestSettingsModal 透傳 initialActiveId**

在 `ContestSettingsModal.tsx` 的 `ContestSettingsModalProps` 介面新增一行：

```ts
  initialActiveId?: ContestSettingsSectionId;
```

從 `@/features/contest/modules/types` import 該型別，把 `initialActiveId` 加進解構參數，並傳給 `SettingsModal`：

```tsx
    <SettingsModal
      open={open}
      onRequestClose={onRequestClose}
      modalHeading={t("settings.title", "競賽設定")}
      navItems={navItems}
      initialActiveId={initialActiveId}
      renderPanel={renderPanel}
    />
```

- [ ] **Step 5: ContestSettingsOverlay 透傳 initialSection**

在 `AdminContestSettingsScreen.tsx` 把 props 介面改成：

```ts
interface ContestSettingsOverlayProps {
  open: boolean;
  onClose: () => void;
  initialSection?: ContestSettingsSectionId;
}
```

解構加上 `initialSection`，並在 `<ContestSettingsModal ... />` 上補一行 `initialActiveId={initialSection}`。

- [ ] **Step 6: AdminDashboardScreen 保存 section**

在 `AdminDashboardScreen.tsx` 把 `const [settingsOpen, setSettingsOpen] = useState(false);` 改成：

```tsx
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<ContestSettingsSectionId | undefined>(undefined);
```

把 `onOpenSettings` 的傳值改成：

```tsx
          onOpenSettings={(section?: ContestSettingsSectionId) => {
            setSettingsSection(section);
            setSettingsOpen(true);
          }}
```

在 `closeSettings` 內加一行 `setSettingsSection(undefined);`，並在 `<ContestSettingsOverlay ... />` 上補 `initialSection={settingsSection}`。

- [ ] **Step 7: 跑測試確認通過**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npx vitest run src/features/contest/components/admin/settings/ContestSettingsModal.test.tsx src/features/contest/screens/admin/AdminDashboardScreen.test.tsx
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/contest/modules/types.ts \
  frontend/src/features/contest/components/admin/settings/ContestSettingsModal.tsx \
  frontend/src/features/contest/components/admin/settings/ContestSettingsModal.test.tsx \
  frontend/src/features/contest/screens/admin/panels/AdminContestSettingsScreen.tsx \
  frontend/src/features/contest/screens/admin/AdminDashboardScreen.tsx
git commit -m "feat(contest-admin): allow opening contest settings at a given section"
```

---

## Task 2: buildAdminPreparationOverview 資料模型

**Files:**
- Modify: `frontend/src/features/contest/screens/admin/panels/adminOverviewDashboard.model.ts`
- Test: `frontend/src/features/contest/screens/admin/panels/adminOverviewDashboard.model.test.ts`

- [ ] **Step 1: 寫失敗的測試**

在 `adminOverviewDashboard.model.test.ts` 的 import 區加入 `buildAdminPreparationOverview`，並在檔尾新增：

```ts
describe("buildAdminPreparationOverview", () => {
  const baseContest = {
    id: "contest-1",
    status: "draft" as const,
    startTime: "",
    endTime: "",
    contestType: "coding" as const,
    examQuestionsCount: 0,
    rules: "",
    problems: [{ id: "p1" }, { id: "p2" }],
    participantCount: 0,
  };

  const participant = {
    userId: "u1",
    username: "student1",
    displayName: "林品儀",
    score: 0,
    joinedAt: "2026-09-01T00:00:00Z",
    examStatus: "not_started" as const,
    violationCount: 0,
  };

  const build = (contestOverrides = {}, participants = [participant]) =>
    buildAdminPreparationOverview({
      contest: { ...baseContest, ...contestOverrides } as never,
      participants: participants as never,
      nowMs: Date.parse("2026-09-07T00:00:00Z"),
    });

  it("blocks publishing when the schedule is missing", () => {
    const data = build();
    const schedule = data.checklist.find((item) => item.key === "schedule");

    expect(schedule?.level).toBe("blocking");
    expect(data.blockingKeys).toEqual(["schedule"]);
    expect(data.canPublish).toBe(false);
  });

  it("warns but still allows publishing when there are no problems", () => {
    const data = build({
      startTime: "2026-09-08T01:00:00Z",
      endTime: "2026-09-08T03:00:00Z",
      problems: [],
    });
    const problems = data.checklist.find((item) => item.key === "problems");

    expect(problems?.level).toBe("warning");
    expect(data.blockingKeys).toEqual([]);
    expect(data.canPublish).toBe(true);
  });

  it("sorts blocking items above warnings and warnings above done", () => {
    const data = build({ rules: "  " });

    expect(data.checklist.map((item) => item.level)).toEqual([
      "blocking",
      "warning",
      "warning",
      "done",
    ]);
  });

  it("marks every item done when the contest is fully prepared", () => {
    const data = build({
      startTime: "2026-09-08T01:00:00Z",
      endTime: "2026-09-08T03:00:00Z",
      rules: "禁止攜帶手機",
    });

    expect(data.checklist.every((item) => item.level === "done")).toBe(true);
    expect(data.canPublish).toBe(true);
  });

  it("reports the upcoming phase and a countdown once published", () => {
    const data = build({
      status: "published",
      startTime: "2026-09-07T02:00:00Z",
      endTime: "2026-09-07T04:00:00Z",
      rules: "禁止攜帶手機",
    });

    expect(data.phase).toBe("upcoming");
    expect(data.countdownMs).toBe(2 * 60 * 60 * 1000);
  });

  it("counts paper exam questions instead of coding problems", () => {
    const data = build({
      contestType: "paper_exam",
      problems: [],
      examQuestionsCount: 5,
    });
    const problems = data.checklist.find((item) => item.key === "problems");

    expect(problems?.level).toBe("done");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npx vitest run src/features/contest/screens/admin/panels/adminOverviewDashboard.model.test.ts
```

Expected: FAIL —— `buildAdminPreparationOverview is not a function`。

- [ ] **Step 3: 實作 model**

在 `adminOverviewDashboard.model.ts` 檔尾新增：

```ts
export type PreparationPhase = "draft" | "upcoming";

export type PreparationItemLevel = "done" | "warning" | "blocking";

export type PreparationItemKey =
  | "schedule"
  | "problems"
  | "participants"
  | "rules";

export interface PreparationChecklistItem {
  key: PreparationItemKey;
  level: PreparationItemLevel;
  title: string;
  description: string;
  actionLabel: string;
}

export interface PreparationInfoCell {
  key: string;
  label: string;
  value: string;
}

export interface PreparationParticipantRow {
  userId: string;
  displayName: string;
  username: string;
}

export interface AdminPreparationOverviewData {
  phase: PreparationPhase;
  infoCells: PreparationInfoCell[];
  checklist: PreparationChecklistItem[];
  blockingKeys: PreparationItemKey[];
  canPublish: boolean;
  countdownMs: number | null;
  participants: PreparationParticipantRow[];
}

const LEVEL_ORDER: Record<PreparationItemLevel, number> = {
  blocking: 0,
  warning: 1,
  done: 2,
};

const hasValidWindow = (contest: ContestDetail) => {
  const start = Date.parse(contest.startTime ?? "");
  const end = Date.parse(contest.endTime ?? "");
  return (
    Number.isFinite(start) && Number.isFinite(end) && end > start
  );
};

const workItemCount = (contest: ContestDetail) =>
  contest.contestType === "paper_exam"
    ? contest.examQuestionsCount
    : contest.problems.length;

export const buildAdminPreparationOverview = ({
  contest,
  participants,
  nowMs = Date.now(),
  tr = defaultDashboardText,
}: {
  contest: ContestDetail;
  participants: ContestParticipant[];
  nowMs?: number;
  tr?: DashboardText;
}): AdminPreparationOverviewData => {
  const students = studentParticipants(participants);
  const scheduled = hasValidWindow(contest);
  const problemCount = workItemCount(contest);
  const hasRules = (contest.rules ?? "").trim().length > 0;
  const phase: PreparationPhase =
    contest.status === "draft" ? "draft" : "upcoming";

  const items: PreparationChecklistItem[] = [
    {
      key: "schedule",
      level: scheduled ? "done" : "blocking",
      title: tr("adminOverview.preparation.schedule.title", "考試時間"),
      description: scheduled
        ? tr(
            "adminOverview.preparation.schedule.done",
            "{{start}} - {{end}}",
            {
              start: new Date(contest.startTime).toLocaleString(),
              end: new Date(contest.endTime).toLocaleString(),
            },
          )
        : tr(
            "adminOverview.preparation.schedule.missing",
            "尚未設定，發布前必填",
          ),
      actionLabel: tr("adminOverview.preparation.schedule.action", "設定時間"),
    },
    {
      key: "problems",
      level: problemCount > 0 ? "done" : "warning",
      title: tr("adminOverview.preparation.problems.title", "題目準備"),
      description:
        problemCount > 0
          ? tr("adminOverview.preparation.problems.done", "已設定 {{count}} 題", {
              count: problemCount,
            })
          : tr("adminOverview.preparation.problems.missing", "尚未新增題目"),
      actionLabel: tr("adminOverview.preparation.problems.action", "前往題目管理"),
    },
    {
      key: "participants",
      level: students.length > 0 ? "done" : "warning",
      title: tr("adminOverview.preparation.participants.title", "考生名單"),
      description:
        students.length > 0
          ? tr(
              "adminOverview.preparation.participants.done",
              "已加入 {{count}} 人",
              { count: students.length },
            )
          : tr(
              "adminOverview.preparation.participants.missing",
              "尚未加入任何考生",
            ),
      actionLabel: tr("adminOverview.preparation.participants.action", "管理名單"),
    },
    {
      key: "rules",
      level: hasRules ? "done" : "warning",
      title: tr("adminOverview.preparation.rules.title", "競賽規則"),
      description: hasRules
        ? tr("adminOverview.preparation.rules.done", "已設定規則內容")
        : tr("adminOverview.preparation.rules.missing", "建議補上考試規則與注意事項"),
      actionLabel: tr("adminOverview.preparation.rules.action", "開啟設定"),
    },
  ];

  const checklist = [...items].sort(
    (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level],
  );
  const blockingKeys = checklist
    .filter((item) => item.level === "blocking")
    .map((item) => item.key);

  const startMs = Date.parse(contest.startTime ?? "");
  const countdownMs =
    phase === "upcoming" && Number.isFinite(startMs) && startMs > nowMs
      ? startMs - nowMs
      : null;

  return {
    phase,
    infoCells: [
      {
        key: "contestType",
        label: tr("adminOverview.preparation.info.contestType", "考卷題型"),
        value:
          contest.contestType === "paper_exam"
            ? tr("adminOverview.examType.paperExam", "Paper Exam")
            : tr("adminOverview.examType.coding", "Coding Test"),
      },
      {
        key: "problems",
        label: tr("adminOverview.preparation.info.problems", "題目數量"),
        value: String(problemCount),
      },
      {
        key: "participants",
        label: tr("adminOverview.preparation.info.participants", "考生人數"),
        value: String(students.length),
      },
    ],
    checklist,
    blockingKeys,
    canPublish: blockingKeys.length === 0,
    countdownMs,
    participants: students.map((participant) => ({
      userId: participant.userId,
      displayName: getProfileDisplayName(participant),
      username: participant.username,
    })),
  };
};
```

- [ ] **Step 4: 跑測試確認通過**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npx vitest run src/features/contest/screens/admin/panels/adminOverviewDashboard.model.test.ts
```

Expected: PASS（含既有的 `buildAdminOverviewDashboard` 測試）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/contest/screens/admin/panels/adminOverviewDashboard.model.ts \
  frontend/src/features/contest/screens/admin/panels/adminOverviewDashboard.model.test.ts
git commit -m "feat(contest-admin): add preparation overview data model"
```

---

## Task 3: PreparationChecklist 展示元件

**Files:**
- Create: `frontend/src/features/contest/components/admin/PreparationChecklist.tsx`
- Create: `frontend/src/features/contest/components/admin/PreparationChecklist.module.scss`
- Test: `frontend/src/features/contest/components/admin/PreparationChecklist.test.tsx`

- [ ] **Step 1: 寫失敗的測試**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PreparationChecklistItem } from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";
import PreparationChecklist from "./PreparationChecklist";

const items: PreparationChecklistItem[] = [
  {
    key: "schedule",
    level: "blocking",
    title: "考試時間",
    description: "尚未設定，發布前必填",
    actionLabel: "設定時間",
  },
  {
    key: "problems",
    level: "done",
    title: "題目準備",
    description: "已設定 2 題",
    actionLabel: "前往題目管理",
  },
];

describe("PreparationChecklist", () => {
  it("renders one row per item with its description", () => {
    render(<PreparationChecklist items={items} onItemAction={vi.fn()} />);

    expect(screen.getByText("考試時間")).toBeInTheDocument();
    expect(screen.getByText("尚未設定，發布前必填")).toBeInTheDocument();
    expect(screen.getByText("已設定 2 題")).toBeInTheDocument();
  });

  it("calls onItemAction with the item key", async () => {
    const onItemAction = vi.fn();
    render(<PreparationChecklist items={items} onItemAction={onItemAction} />);

    await userEvent.click(
      screen.getByRole("button", { name: "設定時間" }),
    );

    expect(onItemAction).toHaveBeenCalledWith("schedule");
  });

  it("marks blocking rows for assistive technology", () => {
    render(<PreparationChecklist items={items} onItemAction={vi.fn()} />);

    const row = screen.getByText("考試時間").closest("li");
    expect(row).toHaveAttribute("data-level", "blocking");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npx vitest run src/features/contest/components/admin/PreparationChecklist.test.tsx
```

Expected: FAIL —— 找不到 `./PreparationChecklist`。

- [ ] **Step 3: 實作元件**

`PreparationChecklist.tsx`：

```tsx
import { Button, Tag } from "@carbon/react";
import {
  CheckmarkFilled,
  WarningAltFilled,
  WarningFilled,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type {
  PreparationChecklistItem,
  PreparationItemKey,
  PreparationItemLevel,
} from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";
import styles from "./PreparationChecklist.module.scss";

interface PreparationChecklistProps {
  items: PreparationChecklistItem[];
  onItemAction: (key: PreparationItemKey) => void;
}

const LEVEL_ICON = {
  done: CheckmarkFilled,
  warning: WarningAltFilled,
  blocking: WarningFilled,
} as const;

const LEVEL_TAG_TYPE = {
  done: "green",
  warning: "warm-gray",
  blocking: "red",
} as const;

export default function PreparationChecklist({
  items,
  onItemAction,
}: PreparationChecklistProps) {
  const { t } = useTranslation("contest");

  const levelLabel = (level: PreparationItemLevel) => {
    if (level === "done") {
      return t("adminOverview.preparation.level.done", "已完成");
    }
    if (level === "blocking") {
      return t("adminOverview.preparation.level.blocking", "發布前必填");
    }
    return t("adminOverview.preparation.level.warning", "建議設定");
  };

  return (
    <ul className={styles.list}>
      {items.map((item) => {
        const Icon = LEVEL_ICON[item.level];
        return (
          <li key={item.key} className={styles.row} data-level={item.level}>
            <Icon size={18} className={styles[item.level]} />
            <div className={styles.text}>
              <span className={styles.title}>{item.title}</span>
              <span className={styles.description}>{item.description}</span>
            </div>
            <Tag size="sm" type={LEVEL_TAG_TYPE[item.level]}>
              {levelLabel(item.level)}
            </Tag>
            <Button
              kind="tertiary"
              size="sm"
              onClick={() => onItemAction(item.key)}
            >
              {item.actionLabel}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
```

`PreparationChecklist.module.scss`：

```scss
.list {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid var(--cds-border-subtle);
}

.text {
  display: grid;
  gap: 0.125rem;
  min-width: 0;
}

.title {
  font-size: var(--cds-body-compact-01-font-size, 0.875rem);
  color: var(--cds-text-primary);
}

.description {
  font-size: var(--cds-label-01-font-size, 0.75rem);
  color: var(--cds-text-secondary);
}

.done {
  fill: var(--cds-support-success);
}

.warning {
  fill: var(--cds-support-warning);
}

.blocking {
  fill: var(--cds-support-error);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npx vitest run src/features/contest/components/admin/PreparationChecklist.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/contest/components/admin/PreparationChecklist.tsx \
  frontend/src/features/contest/components/admin/PreparationChecklist.module.scss \
  frontend/src/features/contest/components/admin/PreparationChecklist.test.tsx
git commit -m "feat(contest-admin): add preparation checklist component"
```

---

## Task 4: AdminPreparationCommandCenter 外殼

**Files:**
- Create: `frontend/src/features/contest/components/admin/AdminPreparationCommandCenter.tsx`
- Create: `frontend/src/features/contest/components/admin/AdminPreparationCommandCenter.module.scss`
- Test: `frontend/src/features/contest/components/admin/AdminPreparationCommandCenter.test.tsx`

元件是純展示：所有資料來自 `data`，所有動作都是注入的 callback。`AdminSegmentedDashboard` 的 `tabs` 是 optional，準備型畫面不用分頁，只傳 `header` / `primary` / `side`。

- [ ] **Step 1: 寫失敗的測試**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AdminPreparationOverviewData } from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";
import AdminPreparationCommandCenter from "./AdminPreparationCommandCenter";

const baseData: AdminPreparationOverviewData = {
  phase: "draft",
  infoCells: [
    { key: "contestType", label: "考卷題型", value: "Coding Test" },
    { key: "problems", label: "題目數量", value: "2" },
    { key: "participants", label: "考生人數", value: "3" },
  ],
  checklist: [
    {
      key: "schedule",
      level: "blocking",
      title: "考試時間",
      description: "尚未設定，發布前必填",
      actionLabel: "設定時間",
    },
    {
      key: "problems",
      level: "done",
      title: "題目準備",
      description: "已設定 2 題",
      actionLabel: "前往題目管理",
    },
  ],
  blockingKeys: ["schedule"],
  canPublish: false,
  countdownMs: null,
  participants: [
    { userId: "u1", displayName: "林品儀", username: "114705061" },
  ],
};

const renderCenter = (
  overrides: Partial<AdminPreparationOverviewData> = {},
  handlers: Record<string, ReturnType<typeof vi.fn>> = {},
) => {
  const props = {
    onItemAction: vi.fn(),
    onPublishContest: vi.fn(),
    onRevertToDraft: vi.fn(),
    onPreviewAsStudent: vi.fn(),
    onOpenContestHome: vi.fn(),
    onOpenAttendanceProjection: vi.fn(),
    ...handlers,
  };
  render(
    <AdminPreparationCommandCenter
      header={<h2>管理總覽</h2>}
      data={{ ...baseData, ...overrides }}
      publishing={false}
      attendanceCheckEnabled={false}
      {...props}
    />,
  );
  return props;
};

describe("AdminPreparationCommandCenter", () => {
  it("shows the publish action as the primary next step in draft", () => {
    renderCenter();

    expect(
      screen.getByRole("button", { name: "發布競賽" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "退回草稿" }),
    ).not.toBeInTheDocument();
  });

  it("publishes when the primary action is used", async () => {
    const props = renderCenter();

    await userEvent.click(screen.getByRole("button", { name: "發布競賽" }));

    expect(props.onPublishContest).toHaveBeenCalledTimes(1);
  });

  it("swaps the primary action for entry links once upcoming", () => {
    renderCenter({
      phase: "upcoming",
      canPublish: true,
      blockingKeys: [],
      countdownMs: 2 * 60 * 60 * 1000,
    });

    expect(
      screen.queryByRole("button", { name: "發布競賽" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "退回草稿" }),
    ).toBeInTheDocument();
  });

  it("lists participants without score or connection columns", () => {
    renderCenter();

    expect(screen.getByText("林品儀")).toBeInTheDocument();
    expect(screen.queryByText("0.00")).not.toBeInTheDocument();
    expect(screen.queryByText("離線")).not.toBeInTheDocument();
  });

  it("shows an empty state when nobody has been added", () => {
    renderCenter({ participants: [] });

    expect(
      screen.getByText("尚未加入任何考生"),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npx vitest run src/features/contest/components/admin/AdminPreparationCommandCenter.test.tsx
```

Expected: FAIL —— 找不到 `./AdminPreparationCommandCenter`。

- [ ] **Step 3: 實作元件**

`AdminPreparationCommandCenter.tsx`：

```tsx
import type { ReactNode } from "react";
import { Button } from "@carbon/react";
import { Launch, QrCode, View } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import AdminSegmentedDashboard from "@/features/contest/components/admin/AdminSegmentedDashboard";
import PreparationChecklist from "@/features/contest/components/admin/PreparationChecklist";
import type {
  AdminPreparationOverviewData,
  PreparationItemKey,
} from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";
import { BlockHeader } from "@/shared/components/dashboard";
import styles from "./AdminPreparationCommandCenter.module.scss";

interface AdminPreparationCommandCenterProps {
  header: ReactNode;
  data: AdminPreparationOverviewData;
  publishing: boolean;
  attendanceCheckEnabled: boolean;
  onItemAction: (key: PreparationItemKey) => void;
  onPublishContest: () => void;
  onRevertToDraft: () => void;
  onPreviewAsStudent: () => void;
  onOpenContestHome: () => void;
  onOpenAttendanceProjection: () => void;
}

const formatCountdown = (ms: number) => {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export default function AdminPreparationCommandCenter({
  header,
  data,
  publishing,
  attendanceCheckEnabled,
  onItemAction,
  onPublishContest,
  onRevertToDraft,
  onPreviewAsStudent,
  onOpenContestHome,
  onOpenAttendanceProjection,
}: AdminPreparationCommandCenterProps) {
  const { t } = useTranslation("contest");
  const isDraft = data.phase === "draft";

  const primary = (
    <div className={styles.primaryColumn}>
      <div className={styles.infoRow}>
        {data.infoCells.map((cell) => (
          <div key={cell.key} className={styles.infoCell}>
            <span className={styles.infoLabel}>{cell.label}</span>
            <span className={styles.infoValue}>{cell.value}</span>
          </div>
        ))}
      </div>

      <section>
        <BlockHeader
          title={t("adminOverview.preparation.checklistTitle", "發布前檢查")}
          description={t(
            "adminOverview.preparation.checklistDescription",
            "先把缺的補齊，再把競賽發布給學生。",
          )}
        />
        <PreparationChecklist items={data.checklist} onItemAction={onItemAction} />
      </section>

      <section>
        <BlockHeader
          title={t("adminOverview.preparation.participantsTitle", "考生名單")}
        />
        {data.participants.length === 0 ? (
          <p className={styles.emptyState}>
            {t(
              "adminOverview.preparation.participants.missing",
              "尚未加入任何考生",
            )}
          </p>
        ) : (
          <ul className={styles.participantList}>
            {data.participants.map((participant) => (
              <li key={participant.userId} className={styles.participantRow}>
                <span className={styles.participantName}>
                  {participant.displayName}
                </span>
                <span className={styles.participantHandle}>
                  @{participant.username}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  const side = (
    <div className={styles.sideColumn}>
      <section className={styles.sideBlock}>
        <span className={styles.sideLabel}>
          {t("adminOverview.preparation.nextStep", "下一步")}
        </span>
        {isDraft ? (
          <>
            <Button
              kind="primary"
              size="md"
              disabled={publishing}
              onClick={onPublishContest}
            >
              {t("adminOverview.actions.publishContest", "發布競賽")}
            </Button>
            <p className={styles.sideNote}>
              {data.canPublish
                ? t(
                    "adminOverview.actions.publishContestBody",
                    "發布後學生就可以看到這場競賽。",
                  )
                : t(
                    "adminOverview.preparation.blockedBySchedule",
                    "發布前會先請你設定考試時間",
                  )}
            </p>
          </>
        ) : (
          <>
            {data.countdownMs !== null && (
              <p className={styles.countdown}>
                {t("adminOverview.preparation.startsIn", "距離開考 {{value}}", {
                  value: formatCountdown(data.countdownMs),
                })}
              </p>
            )}
            <Button
              kind="tertiary"
              size="md"
              renderIcon={Launch}
              onClick={onOpenContestHome}
            >
              {t("adminOverview.actions.openContestHomepage", "開啟競賽主頁")}
            </Button>
            {attendanceCheckEnabled && (
              <Button
                kind="ghost"
                size="md"
                renderIcon={QrCode}
                onClick={onOpenAttendanceProjection}
              >
                {t(
                  "adminOverview.screen.actions.attendanceProjection",
                  "開啟簽到投屏",
                )}
              </Button>
            )}
          </>
        )}
      </section>

      <section className={styles.sideBlock}>
        <span className={styles.sideLabel}>
          {t("adminOverview.preparation.studentView", "學生看到的樣子")}
        </span>
        <Button
          kind="tertiary"
          size="md"
          renderIcon={View}
          onClick={onPreviewAsStudent}
        >
          {t("adminOverview.preparation.previewAsStudent", "預覽考生視角")}
        </Button>
        {isDraft && (
          <p className={styles.sideNote}>
            {t(
              "adminOverview.preparation.draftHiddenNote",
              "草稿不會出現在學生的競賽列表",
            )}
          </p>
        )}
      </section>

      {!isDraft && (
        <section className={styles.sideBlock}>
          <Button
            kind="danger--tertiary"
            size="md"
            disabled={publishing}
            onClick={onRevertToDraft}
          >
            {t("adminOverview.actions.revertToDraft", "退回草稿")}
          </Button>
        </section>
      )}
    </div>
  );

  return (
    <AdminSegmentedDashboard
      ariaLabel={t("adminOverview.preparation.ariaLabel", "競賽準備總覽")}
      header={header}
      primary={primary}
      side={side}
    />
  );
}
```

`AdminPreparationCommandCenter.module.scss`：

```scss
.primaryColumn {
  display: grid;
  gap: 1.5rem;
}

.infoRow {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.infoCell {
  display: grid;
  gap: 0.25rem;
  padding: 0.75rem;
  background: var(--cds-layer-01);
}

.infoLabel {
  font-size: var(--cds-label-01-font-size, 0.75rem);
  color: var(--cds-text-secondary);
}

.infoValue {
  font-size: var(--cds-heading-03-font-size, 1.25rem);
  color: var(--cds-text-primary);
}

.participantList {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.participantRow {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--cds-border-subtle);
}

.participantName {
  font-size: var(--cds-body-compact-01-font-size, 0.875rem);
  color: var(--cds-text-primary);
}

.participantHandle {
  font-size: var(--cds-label-01-font-size, 0.75rem);
  color: var(--cds-text-secondary);
}

.emptyState {
  padding: 1rem 0;
  font-size: var(--cds-body-compact-01-font-size, 0.875rem);
  color: var(--cds-text-secondary);
}

.sideColumn {
  display: grid;
  gap: 1.5rem;
}

.sideBlock {
  display: grid;
  gap: 0.5rem;
  justify-items: start;
  padding-top: 1rem;
  border-top: 1px solid var(--cds-border-subtle);

  &:first-child {
    padding-top: 0;
    border-top: none;
  }
}

.sideLabel {
  font-size: var(--cds-label-01-font-size, 0.75rem);
  color: var(--cds-text-secondary);
}

.sideNote {
  margin: 0;
  font-size: var(--cds-label-01-font-size, 0.75rem);
  color: var(--cds-text-secondary);
}

.countdown {
  margin: 0;
  font-size: var(--cds-heading-03-font-size, 1.25rem);
  color: var(--cds-text-primary);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npx vitest run src/features/contest/components/admin/AdminPreparationCommandCenter.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/contest/components/admin/AdminPreparationCommandCenter.tsx \
  frontend/src/features/contest/components/admin/AdminPreparationCommandCenter.module.scss \
  frontend/src/features/contest/components/admin/AdminPreparationCommandCenter.test.tsx
git commit -m "feat(contest-admin): add preparation command center shell"
```

---

## Task 5: AdminOverviewScreen 狀態分歧與發布動作

**Files:**
- Modify: `frontend/src/features/contest/screens/admin/panels/AdminOverviewScreen.tsx`
- Test: `frontend/src/features/contest/screens/admin/panels/AdminOverviewScreen.test.tsx`（若不存在則新建）

- [ ] **Step 1: 寫失敗的測試**

在 `AdminOverviewScreen.test.tsx` 新增（沿用該檔既有的 context mock；若檔案不存在，以 `AdminOverviewCommandCenter.test.tsx` 的 mock 樣式建立，並額外 mock `@/infrastructure/api/repositories` 的 `updateContest`）：

```tsx
it("renders the preparation view for a draft contest", () => {
  renderScreen({ status: "draft", startTime: "", endTime: "" });

  expect(screen.getByRole("button", { name: "發布競賽" })).toBeInTheDocument();
  expect(screen.queryByText("批改進度")).not.toBeInTheDocument();
});

it("renders the command center once the contest is running", () => {
  renderScreen({
    status: "published",
    startTime: new Date(Date.now() - 60_000).toISOString(),
    endTime: new Date(Date.now() + 60_000).toISOString(),
  });

  expect(
    screen.queryByRole("button", { name: "發布競賽" }),
  ).not.toBeInTheDocument();
});

it("opens the schedule settings instead of publishing when time is missing", async () => {
  const onOpenSettings = vi.fn();
  renderScreen({ status: "draft", startTime: "", endTime: "" }, { onOpenSettings });

  await userEvent.click(screen.getByRole("button", { name: "發布競賽" }));

  expect(onOpenSettings).toHaveBeenCalledWith("general");
  expect(updateContest).not.toHaveBeenCalled();
});

it("publishes when the schedule is set", async () => {
  renderScreen({
    status: "draft",
    startTime: new Date(Date.now() + 3_600_000).toISOString(),
    endTime: new Date(Date.now() + 7_200_000).toISOString(),
  });

  await userEvent.click(screen.getByRole("button", { name: "發布競賽" }));

  expect(updateContest).toHaveBeenCalledWith("contest-1", {
    status: "published",
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npx vitest run src/features/contest/screens/admin/panels/AdminOverviewScreen.test.tsx
```

Expected: FAIL —— draft 也 render `AdminOverviewCommandCenter`，找不到「發布競賽」按鈕。

- [ ] **Step 3: 加入 imports 與準備型資料**

在 `AdminOverviewScreen.tsx` 的 import 區補上：

```tsx
import AdminPreparationCommandCenter from "@/features/contest/components/admin/AdminPreparationCommandCenter";
import { getContestState } from "@/core/entities/contest.entity";
import type { PreparationItemKey } from "./adminOverviewDashboard.model";
import { buildAdminPreparationOverview } from "./adminOverviewDashboard.model";
import type { ContestSettingsSectionId } from "@/features/contest/modules/types";
```

在 `contestInProgress` 的 `useMemo` 之後新增：

```tsx
  const isPreparationPhase = useMemo(() => {
    if (!contest) return false;
    if (contest.status === "draft") return true;
    if (contest.status === "archived") return false;
    return getContestState(contest, currentTimeMs) === "upcoming";
  }, [contest, currentTimeMs]);

  const preparationData = useMemo(() => {
    if (!contest || !isPreparationPhase) return null;
    return buildAdminPreparationOverview({
      contest,
      participants,
      nowMs: currentTimeMs,
      tr,
    });
  }, [contest, isPreparationPhase, participants, currentTimeMs, tr]);
```

`getContestState` 在沒有時間時會回傳 `running`，所以 `status === "draft"` 必須先判斷，草稿才不會因為沒設時間被誤判成進行中。

- [ ] **Step 4: 讓 openSettings 可帶 section**

把既有的 `openSettings` 改成：

```tsx
  const openSettings = useCallback(
    (section?: ContestSettingsSectionId) => {
      if (onOpenSettings) {
        onOpenSettings(section);
        return;
      }
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("panel", "settings");
        return next;
      });
    },
    [onOpenSettings, setSearchParams],
  );
```

header 工具列裡原本的 `onClick={openSettings}` 會把滑鼠事件當成第一個參數傳進去，改成 `onClick={() => openSettings()}`。

- [ ] **Step 5: 新增發布與退回草稿 handler**

在 `handleToggleResultsPublished` 附近新增：

```tsx
  const [publishingContest, setPublishingContest] = useState(false);

  const handlePublishContest = useCallback(async () => {
    if (!contest?.id || publishingContest) return;
    if (!preparationData?.canPublish) {
      showToast({
        kind: "warning",
        title: t("adminOverview.actions.publishContestFailed", "發布失敗"),
        subtitle: t(
          "adminOverview.preparation.blockedBySchedule",
          "發布前會先請你設定考試時間",
        ),
      });
      openSettings("general");
      return;
    }
    setPublishingContest(true);
    try {
      await updateContest(contest.id, { status: "published" });
      await refreshContest();
      showToast({
        kind: "success",
        title: t("adminOverview.actions.publishContestSuccess", "競賽已發布"),
      });
    } catch (error) {
      showToast({
        kind: "error",
        title: t("adminOverview.actions.publishContestFailed", "發布失敗"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPublishingContest(false);
    }
  }, [
    contest?.id,
    openSettings,
    preparationData?.canPublish,
    publishingContest,
    refreshContest,
    showToast,
    t,
  ]);

  const handleRevertToDraft = useCallback(async () => {
    if (!contest?.id || publishingContest) return;
    setPublishingContest(true);
    try {
      await updateContest(contest.id, { status: "draft" });
      await refreshContest();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("adminOverview.actions.publishContestFailed", "發布失敗"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPublishingContest(false);
    }
  }, [contest?.id, publishingContest, refreshContest, showToast, t]);

  const handleChecklistAction = useCallback(
    (key: PreparationItemKey) => {
      if (key === "problems") {
        openPanel("problem_editor");
        return;
      }
      if (key === "participants") {
        if (classroomBound) {
          openPanel("settings");
          return;
        }
        setAddParticipantOpen(true);
        return;
      }
      openSettings("general");
    },
    [classroomBound, openPanel, openSettings],
  );
```

- [ ] **Step 6: 分歧 render**

把 `return (...)` 裡的 `{dashboardData && (<AdminOverviewCommandCenter ... />)}` 改成：

```tsx
        {isPreparationPhase && preparationData ? (
          <AdminPreparationCommandCenter
            header={renderContestHeader()}
            data={preparationData}
            publishing={publishingContest}
            attendanceCheckEnabled={Boolean(contest.attendanceCheckEnabled)}
            onItemAction={handleChecklistAction}
            onPublishContest={() => void handlePublishContest()}
            onRevertToDraft={() => void handleRevertToDraft()}
            onPreviewAsStudent={() => {
              if (!contestHomePath) return;
              window.open(contestHomePath, "_blank", "noopener,noreferrer");
            }}
            onOpenContestHome={() => {
              if (!contestHomePath) return;
              window.open(contestHomePath, "_blank", "noopener,noreferrer");
            }}
            onOpenAttendanceProjection={() => {
              if (!attendanceProjectionPath) return;
              window.open(
                attendanceProjectionPath,
                "_blank",
                "noopener,noreferrer",
              );
            }}
          />
        ) : (
          dashboardData && (
            <AdminOverviewCommandCenter
              /* 既有 props 原封不動保留 */
            />
          )
        )}
```

`AdminOverviewCommandCenter` 的 props 一個都不要改，只是被移進 else 分支。

`preparationData` 為 null 時（例如 contest 尚未載入）維持既有的 loading 行為，不要另外加空畫面。

- [ ] **Step 7: 跑測試確認通過**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npx vitest run src/features/contest/screens/admin/panels/AdminOverviewScreen.test.tsx
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/contest/screens/admin/panels/AdminOverviewScreen.tsx \
  frontend/src/features/contest/screens/admin/panels/AdminOverviewScreen.test.tsx
git commit -m "feat(contest-admin): branch overview by contest phase"
```

---

## Task 6: i18n 四語系

**Files:**
- Modify: `frontend/src/i18n/locales/zh-TW/contest.json`
- Modify: `frontend/src/i18n/locales/en/contest.json`
- Modify: `frontend/src/i18n/locales/ja/contest.json`
- Modify: `frontend/src/i18n/locales/ko/contest.json`

`adminOverview.actions.publishContest` / `publishContestBody` / `publishContestSuccess` / `publishContestFailed` / `revertToDraft` / `openContestHomepage` 與 `adminOverview.screen.actions.attendanceProjection` 四語系皆已存在，直接沿用，不要重複新增。

- [ ] **Step 1: 加入 zh-TW**

在 `zh-TW/contest.json` 的 `adminOverview` 物件下新增 `preparation`：

```json
"preparation": {
  "ariaLabel": "競賽準備總覽",
  "checklistTitle": "發布前檢查",
  "checklistDescription": "先把缺的補齊，再把競賽發布給學生。",
  "participantsTitle": "考生名單",
  "nextStep": "下一步",
  "studentView": "學生看到的樣子",
  "previewAsStudent": "預覽考生視角",
  "draftHiddenNote": "草稿不會出現在學生的競賽列表",
  "blockedBySchedule": "發布前會先請你設定考試時間",
  "startsIn": "距離開考 {{value}}",
  "level": {
    "done": "已完成",
    "warning": "建議設定",
    "blocking": "發布前必填"
  },
  "info": {
    "contestType": "考卷題型",
    "problems": "題目數量",
    "participants": "考生人數"
  },
  "schedule": {
    "title": "考試時間",
    "done": "{{start}} - {{end}}",
    "missing": "尚未設定，發布前必填",
    "action": "設定時間"
  },
  "problems": {
    "title": "題目準備",
    "done": "已設定 {{count}} 題",
    "missing": "尚未新增題目",
    "action": "前往題目管理"
  },
  "participants": {
    "title": "考生名單",
    "done": "已加入 {{count}} 人",
    "missing": "尚未加入任何考生",
    "action": "管理名單"
  },
  "rules": {
    "title": "競賽規則",
    "done": "已設定規則內容",
    "missing": "建議補上考試規則與注意事項",
    "action": "開啟設定"
  }
}
```

- [ ] **Step 2: 加入 en / ja / ko**

在三個語系的同一位置補上結構完全相同的 `preparation` 物件，值改為該語言。英文示例（`ja` / `ko` 依同一結構翻譯）：

```json
"preparation": {
  "ariaLabel": "Contest preparation overview",
  "checklistTitle": "Before you publish",
  "checklistDescription": "Fill in what's missing, then publish the contest to students.",
  "participantsTitle": "Participants",
  "nextStep": "Next step",
  "studentView": "What students see",
  "previewAsStudent": "Preview as student",
  "draftHiddenNote": "Drafts don't appear in the student contest list",
  "blockedBySchedule": "Set the exam schedule before publishing",
  "startsIn": "Starts in {{value}}",
  "level": {
    "done": "Done",
    "warning": "Suggested",
    "blocking": "Required to publish"
  },
  "info": {
    "contestType": "Exam type",
    "problems": "Problems",
    "participants": "Participants"
  },
  "schedule": {
    "title": "Exam schedule",
    "done": "{{start}} - {{end}}",
    "missing": "Not set — required before publishing",
    "action": "Set schedule"
  },
  "problems": {
    "title": "Problems",
    "done": "{{count}} problems ready",
    "missing": "No problems added yet",
    "action": "Open problem editor"
  },
  "participants": {
    "title": "Participants",
    "done": "{{count}} participants added",
    "missing": "No participants added yet",
    "action": "Manage list"
  },
  "rules": {
    "title": "Contest rules",
    "done": "Rules are set",
    "missing": "Consider adding rules and reminders",
    "action": "Open settings"
  }
}
```

- [ ] **Step 3: 跑 i18n 同步檢查**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run check:i18n
```

Expected: PASS，沒有 missing key 報告。若有缺，依報告補齊該語系。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/i18n/locales/zh-TW/contest.json \
  frontend/src/i18n/locales/en/contest.json \
  frontend/src/i18n/locales/ja/contest.json \
  frontend/src/i18n/locales/ko/contest.json
git commit -m "i18n(contest): add preparation overview strings"
```

---

## Task 7: 移除孤兒元件

這四個元件在這次改動前就已經沒有 production 引用（只有自己的測試在跑），內容已被 Task 2–4 吸收。刪除前先確認確實沒有引用，避免誤刪。

**Files:**
- Delete: `frontend/src/features/contest/components/admin/DraftChecklistPanel.{tsx,module.scss,test.tsx}`
- Delete: `frontend/src/features/contest/components/admin/AdminPreparationDashboard.{tsx,module.scss,test.tsx}`
- Delete: `frontend/src/features/contest/components/admin/OverviewActionWidgets.{tsx,module.scss,test.tsx}`
- Delete: `frontend/src/features/contest/components/admin/OverviewInsightsPanel.{tsx,module.scss,test.tsx}`
- Modify: `frontend/src/features/contest/screens/admin/panels/adminOverviewDashboard.model.ts`
- Modify: `frontend/src/features/contest/screens/admin/panels/adminOverviewDashboard.model.test.ts`

- [ ] **Step 1: 確認沒有殘留引用**

Run:

```bash
grep -rn "DraftChecklistPanel\|AdminPreparationDashboard\|OverviewActionWidgets\|OverviewInsightsPanel\|buildAdminPreparationDashboard" frontend/src --include="*.ts" --include="*.tsx"
```

Expected: 只出現在這四個元件自己的檔案、它們的測試，以及 `adminOverviewDashboard.model.ts` / `.model.test.ts` 裡 `buildAdminPreparationDashboard` 的定義與測試。如果出現在其他檔案，停下來先處理該引用，不要往下刪。

- [ ] **Step 2: 刪除元件檔**

```bash
git rm frontend/src/features/contest/components/admin/DraftChecklistPanel.tsx \
  frontend/src/features/contest/components/admin/DraftChecklistPanel.module.scss \
  frontend/src/features/contest/components/admin/DraftChecklistPanel.test.tsx \
  frontend/src/features/contest/components/admin/AdminPreparationDashboard.tsx \
  frontend/src/features/contest/components/admin/AdminPreparationDashboard.module.scss \
  frontend/src/features/contest/components/admin/AdminPreparationDashboard.test.tsx \
  frontend/src/features/contest/components/admin/OverviewActionWidgets.tsx \
  frontend/src/features/contest/components/admin/OverviewActionWidgets.module.scss \
  frontend/src/features/contest/components/admin/OverviewActionWidgets.test.tsx \
  frontend/src/features/contest/components/admin/OverviewInsightsPanel.tsx \
  frontend/src/features/contest/components/admin/OverviewInsightsPanel.module.scss \
  frontend/src/features/contest/components/admin/OverviewInsightsPanel.test.tsx
```

- [ ] **Step 3: 刪除舊 model**

在 `adminOverviewDashboard.model.ts` 刪除 `buildAdminPreparationDashboard` 函式，以及只被它使用的 `AdminPreparationDashboardData`、`PreparationReadinessState` 型別與相關 helper。在 `adminOverviewDashboard.model.test.ts` 刪除 `buildAdminPreparationDashboard` 的 import 與整個 describe 區塊。

新的 `PreparationItemLevel`（Task 2）與舊的 `PreparationReadinessState` 是不同型別，不要混用或保留 alias。

- [ ] **Step 4: 跑完整前端測試**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run test
```

Expected: PASS，且沒有「cannot find module」類錯誤。

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src/features/contest
git commit -m "refactor(contest-admin): remove superseded preparation widgets"
```

---

## Task 8: Quality gates 與 rendered QA

**Files:** 無新增修改，除非 gate 報錯。

- [ ] **Step 1: typecheck 與 lint**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run typecheck
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run lint
```

Expected: 皆為 PASS。

- [ ] **Step 2: 專案 quality gates**

Run:

```bash
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-naming.js --root frontend/src
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-repository-exports.js
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --all
```

Expected: 皆為 PASS。`check-carbon-style.sh` 若對新 SCSS 的 token 有意見，依它的訊息把硬編碼色值換成 Carbon token，不要加例外。

- [ ] **Step 3: dev 環境 rendered QA**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d
./scripts/dev/check-dev-services.sh
```

在 http://localhost:5173 用教師帳號實際檢查四個情境，desktop 與 mobile 寬度各一次：

1. 全新草稿（無題目、無時間、無考生）—— checklist 四項排序正確、blocking 在最上、「發布競賽」可見
2. 草稿且時間未設定 —— 點「發布競賽」會開啟設定的基本資訊分頁，不會送出 API
3. 草稿且時間已設定 —— 點「發布競賽」成功後畫面自動切成 upcoming 變體
4. upcoming —— 顯示倒數、「退回草稿」可見、「發布競賽」消失

Expected: 四個情境都符合，且沒有出現 0%、「尚無批改資料」等 runtime 空指標。

- [ ] **Step 4: 停掉 test 環境**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test stop \
  backend-test frontend-test pgbouncer-test postgres-test redis-test \
  celery-test celery-high-test fake-ai-adapters
```

不要用 `down`：dev 與 test 共用 project name `online_judge`，`down` 會把 dev 容器一併移除。

- [ ] **Step 5: Commit**

若 gate 有觸發修正才需要：

```bash
git add -A frontend/src
git commit -m "style(contest-admin): satisfy quality gates for preparation overview"
```
