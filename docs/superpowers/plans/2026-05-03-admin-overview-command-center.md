# Admin Overview Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the contest admin overview into a calmer teacher management dashboard that surfaces contest state, students needing action, participant distribution, exam operations, and next actions without showing monitoring source details or submission trend charts.

**Architecture:** Keep the existing admin route, provider, and panel registry. Add a small view-model layer under the admin overview panel so UI components consume derived teacher-facing summaries instead of recomputing participant/event state inline. Recompose `AdminOverviewScreen` using focused Carbon-first sections while preserving existing publish, schedule, password, strict mode, grading, and result actions.

**Tech Stack:** React, TypeScript, Carbon React, SCSS modules, Vitest, React Testing Library, i18next.

---

## Scope

In scope:
- Replace the current admin overview content hierarchy with a teacher command-center layout.
- Use existing data from `ContestAdminContext`, `ContestContext`, `useGradingData`, `computeParticipantStatusKpi`, and `examEvents`.
- Show concise KPI tiles, "待處理考生", "考務狀態", "考生分布", "考務事件", and "下一步".
- Keep the view valid for both `coding` and `paper_exam`.
- Avoid monitoring source details such as webcam/screen share/fullscreen/focus chips.
- Avoid submission trend charts.

Out of scope:
- New backend APIs.
- Redesigning participants, proctoring, logs, grading, or problem editor panels.
- Evidence preview in overview.
- Student-side contest overview changes.

## File Structure

- Modify: `frontend/src/features/contest/screens/admin/panels/AdminOverviewScreen.tsx`
  - Keeps modal/action orchestration.
  - Passes derived dashboard data to new overview sections.
- Modify: `frontend/src/features/contest/screens/admin/panels/AdminOverviewScreen.module.scss`
  - Page-level layout only.
- Create: `frontend/src/features/contest/screens/admin/panels/adminOverviewDashboard.model.ts`
  - Pure derived data functions for KPIs, action rows, status summary, event summary, and next-step state.
- Create: `frontend/src/features/contest/screens/admin/panels/adminOverviewDashboard.model.test.ts`
  - Unit tests for coding/paper-exam compatibility and event filtering.
- Create: `frontend/src/features/contest/components/admin/AdminOverviewCommandCenter.tsx`
  - Presentational Carbon layout for the teacher overview dashboard.
- Create: `frontend/src/features/contest/components/admin/AdminOverviewCommandCenter.module.scss`
  - Component-scoped layout and styling.
- Create: `frontend/src/features/contest/components/admin/AdminOverviewCommandCenter.test.tsx`
  - Rendering tests for major sections and hidden monitoring-source/submission-trend content.
- Modify: `frontend/src/features/contest/components/admin/KpiCards.tsx`
  - Reduce hero chrome and keep only compact contest identity/actions if needed by the new layout.
- Modify: `frontend/src/features/contest/components/admin/KpiCards.test.tsx`
  - Update expectations for compact teacher header.
- Optional modify: `frontend/src/i18n/locales/*/contest*.json`
  - Add missing labels only if hardcoded fallback labels become too large or duplicated.

## Data Contract

Use only these existing fields:
- `contest`: `name`, `status`, `contestType`, `startTime`, `endTime`, `resultsPublished`, `cheatDetectionEnabled`, `participantCount`, `examQuestionsCount`, `problems`, `permissions`.
- `participants`: `userId`, `username`, `userDisplayName`, `displayName`, `examStatus`, `connectionStatus`, `lastHeartbeatAt`, `violationCount`, `score`, `rank`.
- `examEvents`: `id`, `userId`, `userName`, `eventType`, `timestamp`, `reason`, `metadata`.
- `overviewMetrics`: `onlineNow`, `onlineActiveSessions`, `timeProgress`.
- `globalStats`: `totalAnswers`, `gradedAnswers`.

Do not read or display:
- `liveMonitoringSources`
- screen-share/webcam/fullscreen/focus source breakdown
- submission timeline or submission trend

---

### Task 1: Add Admin Overview View Model

**Files:**
- Create: `frontend/src/features/contest/screens/admin/panels/adminOverviewDashboard.model.ts`
- Create: `frontend/src/features/contest/screens/admin/panels/adminOverviewDashboard.model.test.ts`

- [ ] **Step 1: Write failing model tests**

Create `frontend/src/features/contest/screens/admin/panels/adminOverviewDashboard.model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  ContestDetail,
  ContestOverviewMetrics,
  ContestParticipant,
  ExamEvent,
} from "@/core/entities/contest.entity";
import {
  buildAdminOverviewDashboard,
  getTeacherAttentionRows,
} from "./adminOverviewDashboard.model";

const contest = (overrides: Partial<ContestDetail> = {}): ContestDetail =>
  ({
    id: "contest-1",
    name: "演算法期中考",
    description: "",
    startTime: "2026-05-03T09:00:00+08:00",
    endTime: "2026-05-03T11:00:00+08:00",
    status: "published",
    visibility: "private",
    requiresPassword: true,
    hasJoined: false,
    isRegistered: false,
    participantCount: 5,
    contestType: "coding",
    deliveryMode: "exam",
    countsTowardGrade: true,
    cheatDetectionEnabled: true,
    scoreboardVisibleDuringContest: false,
    allowMultipleJoins: false,
    maxCheatWarnings: 3,
    allowAutoUnlock: false,
    autoUnlockMinutes: 0,
    resultsPublished: false,
    examQuestionsCount: 0,
    isExamMonitored: true,
    requiresFullscreen: true,
    canSubmitExam: true,
    permissions: {
      canSwitchView: true,
      canEditContest: true,
      canToggleStatus: true,
      canDeleteContest: true,
      canPublishProblems: true,
      canViewAllSubmissions: true,
      canViewFullScoreboard: true,
      canManageClarifications: true,
    },
    problems: [
      { id: "p1", problemId: "101", label: "A", title: "A", score: 100 },
      { id: "p2", problemId: "102", label: "B", title: "B", score: 100 },
    ],
    ...overrides,
  }) as ContestDetail;

const participant = (
  userId: string,
  examStatus: ContestParticipant["examStatus"],
  overrides: Partial<ContestParticipant> = {},
): ContestParticipant =>
  ({
    userId,
    username: `student-${userId}`,
    userDisplayName: `學生 ${userId}`,
    accountRole: "student",
    connectionStatus: "online",
    score: 0,
    joinedAt: "2026-05-03T08:50:00+08:00",
    examStatus,
    violationCount: 0,
    ...overrides,
  }) as ContestParticipant;

const metrics: ContestOverviewMetrics = {
  onlineNow: 4,
  onlineActiveSessions: 3,
  exam: { status: "running", contestType: "coding" },
  timeProgress: {
    totalSeconds: 7200,
    elapsedSeconds: 2700,
    remainingSeconds: 4500,
    progressPercent: 37.5,
    isStarted: true,
    isEnded: false,
  },
};

describe("adminOverviewDashboard.model", () => {
  it("builds teacher KPIs without monitoring source details", () => {
    const data = buildAdminOverviewDashboard({
      contest: contest(),
      participants: [
        participant("1", "in_progress"),
        participant("2", "submitted"),
        participant("3", "locked", { violationCount: 2 }),
        participant("4", "not_started"),
      ],
      examEvents: [],
      overviewMetrics: metrics,
      gradingStats: { totalAnswers: 10, gradedAnswers: 8 } as any,
      now: new Date("2026-05-03T10:15:00+08:00"),
    });

    expect(data.kpis.map((item) => item.key)).toEqual([
      "online",
      "started",
      "submitted",
      "locked",
      "attention",
    ]);
    expect(data.kpis.find((item) => item.key === "online")?.value).toBe("4 / 5");
    expect(data.distribution.map((item) => item.key)).toEqual([
      "in_progress",
      "not_started",
      "submitted",
      "locked",
      "offline",
    ]);
    expect(JSON.stringify(data)).not.toContain("screen_share");
    expect(JSON.stringify(data)).not.toContain("webcam");
  });

  it("keeps paper exams generic and does not expose submission trends", () => {
    const data = buildAdminOverviewDashboard({
      contest: contest({ contestType: "paper_exam", examQuestionsCount: 12, problems: [] }),
      participants: [participant("1", "submitted")],
      examEvents: [],
      overviewMetrics: { ...metrics, exam: { status: "running", contestType: "paper_exam" } },
      gradingStats: { totalAnswers: 12, gradedAnswers: 6 } as any,
      now: new Date("2026-05-03T10:15:00+08:00"),
    });

    expect(data.examStatus.workItemLabel).toBe("考卷題目");
    expect(data.examStatus.workItemCount).toBe(12);
    expect(JSON.stringify(data)).not.toMatch(/submission|提交趨勢|提交/);
  });

  it("prioritizes locked, violation, offline, and not-started students", () => {
    const events: ExamEvent[] = [
      {
        id: "event-1",
        userId: "2",
        userName: "學生 2",
        eventType: "multiple_displays",
        timestamp: "2026-05-03T10:10:00+08:00",
      } as ExamEvent,
    ];

    const rows = getTeacherAttentionRows({
      participants: [
        participant("1", "locked", { lockedAt: "2026-05-03T10:09:00+08:00" }),
        participant("2", "in_progress", { violationCount: 1 }),
        participant("3", "in_progress", { connectionStatus: "offline" }),
        participant("4", "not_started"),
      ],
      examEvents: events,
      limit: 4,
    });

    expect(rows.map((row) => row.kind)).toEqual([
      "locked",
      "violation",
      "offline",
      "not_started",
    ]);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npx vitest run frontend/src/features/contest/screens/admin/panels/adminOverviewDashboard.model.test.ts
```

Expected: FAIL because `adminOverviewDashboard.model.ts` does not exist.

- [ ] **Step 3: Implement the model**

Create `frontend/src/features/contest/screens/admin/panels/adminOverviewDashboard.model.ts`:

```ts
import type {
  ContestDetail,
  ContestOverviewMetrics,
  ContestParticipant,
  ExamEvent,
} from "@/core/entities/contest.entity";
import type { GlobalStats } from "@/features/contest/screens/settings/grading/gradingTypes";
import { getEventPriority } from "@/features/contest/constants/eventTaxonomy";
import { calculateContestTimeProgressAt, formatDuration } from "@/features/contest/components/admin/overviewMetrics.utils";

export type OverviewKpiKey = "online" | "started" | "submitted" | "locked" | "attention";
export type AttentionKind = "locked" | "violation" | "offline" | "not_started" | "needs_review";

export interface OverviewKpiItem {
  key: OverviewKpiKey;
  label: string;
  value: string;
  tone: "neutral" | "warning" | "danger";
}

export interface TeacherAttentionRow {
  id: string;
  userId: string;
  studentName: string;
  kind: AttentionKind;
  statusLabel: string;
  eventLabel: string;
  timeLabel: string;
  panelTarget: "participants" | "logs" | "proctoring";
}

export interface DistributionItem {
  key: "in_progress" | "not_started" | "submitted" | "locked" | "offline";
  label: string;
  value: number;
  percent: number;
}

export interface ExamStatusSummary {
  timeWindowLabel: string;
  remainingLabel: string;
  timeProgressPercent: number;
  resultsLabel: string;
  gradingLabel: string;
  workItemLabel: string;
  workItemCount: number;
}

export interface RecentExamEventItem {
  id: string;
  label: string;
  studentName: string;
  timeLabel: string;
  tone: "neutral" | "warning" | "danger";
}

export interface NextActionItem {
  key: "attention" | "grading" | "results";
  title: string;
  description: string;
  panelTarget: "participants" | "grading" | "logs";
  disabled?: boolean;
}

export interface AdminOverviewDashboardData {
  kpis: OverviewKpiItem[];
  attentionRows: TeacherAttentionRow[];
  distribution: DistributionItem[];
  examStatus: ExamStatusSummary;
  recentEvents: RecentExamEventItem[];
  nextActions: NextActionItem[];
}

const studentParticipants = (participants: ContestParticipant[]) =>
  participants.filter((participant) => !participant.accountRole || participant.accountRole === "student");

const displayName = (participant: ContestParticipant) =>
  participant.displayName || participant.userDisplayName || participant.username || participant.userId;

const formatTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
};

const formatWindow = (contest: ContestDetail) => {
  const start = formatTime(contest.startTime);
  const end = formatTime(contest.endTime);
  if (start === "-" || end === "-") return "未設定";
  return `${start}-${end}`;
};

const percentage = (value: number, total: number) =>
  total <= 0 ? 0 : Math.round((value / total) * 100);

const latestEventByUser = (events: ExamEvent[]) => {
  const map = new Map<string, ExamEvent>();
  for (const event of events) {
    const current = map.get(event.userId);
    const nextTs = Date.parse(event.timestamp);
    const currentTs = current ? Date.parse(current.timestamp) : Number.NEGATIVE_INFINITY;
    if (!current || nextTs > currentTs) {
      map.set(event.userId, event);
    }
  }
  return map;
};

export const getTeacherAttentionRows = ({
  participants,
  examEvents,
  limit = 5,
}: {
  participants: ContestParticipant[];
  examEvents: ExamEvent[];
  limit?: number;
}): TeacherAttentionRow[] => {
  const latest = latestEventByUser(examEvents.filter((event) => event.eventType !== "heartbeat"));
  const rows: TeacherAttentionRow[] = [];

  for (const participant of studentParticipants(participants)) {
    const latestEvent = latest.get(participant.userId);
    const common = {
      id: participant.userId,
      userId: participant.userId,
      studentName: displayName(participant),
      timeLabel: formatTime(latestEvent?.timestamp || participant.lockedAt || participant.lastHeartbeatAt),
    };

    if (participant.examStatus === "locked") {
      rows.push({
        ...common,
        kind: "locked",
        statusLabel: "鎖定",
        eventLabel: participant.lockReason || "考試已鎖定",
        panelTarget: "participants",
      });
      continue;
    }

    if ((participant.violationCount ?? 0) > 0) {
      rows.push({
        ...common,
        kind: "violation",
        statusLabel: "違規",
        eventLabel: latestEvent ? latestEvent.eventType : `${participant.violationCount} 次違規`,
        panelTarget: "logs",
      });
      continue;
    }

    if (participant.connectionStatus === "offline") {
      rows.push({
        ...common,
        kind: "offline",
        statusLabel: "離線",
        eventLabel: "連線中斷",
        panelTarget: "participants",
      });
      continue;
    }

    if (participant.examStatus === "not_started") {
      rows.push({
        ...common,
        kind: "not_started",
        statusLabel: "未開始",
        eventLabel: "尚未進入考試",
        panelTarget: "participants",
      });
    }
  }

  const order: Record<AttentionKind, number> = {
    locked: 0,
    violation: 1,
    offline: 2,
    not_started: 3,
    needs_review: 4,
  };
  return rows.sort((a, b) => order[a.kind] - order[b.kind]).slice(0, limit);
};

const buildDistribution = (participants: ContestParticipant[]): DistributionItem[] => {
  const students = studentParticipants(participants);
  const total = students.length;
  const count = (predicate: (participant: ContestParticipant) => boolean) =>
    students.filter(predicate).length;

  const items = [
    { key: "in_progress" as const, label: "作答中", value: count((p) => p.examStatus === "in_progress") },
    { key: "not_started" as const, label: "未開始", value: count((p) => p.examStatus === "not_started") },
    { key: "submitted" as const, label: "已交卷", value: count((p) => p.examStatus === "submitted") },
    { key: "locked" as const, label: "鎖定", value: count((p) => p.examStatus === "locked" || p.examStatus === "paused") },
    { key: "offline" as const, label: "離線", value: count((p) => p.connectionStatus === "offline") },
  ];

  return items.map((item) => ({
    ...item,
    percent: percentage(item.value, total),
  }));
};

const buildRecentEvents = (examEvents: ExamEvent[]): RecentExamEventItem[] =>
  examEvents
    .filter((event) => event.eventType !== "heartbeat")
    .slice(0, 4)
    .map((event) => {
      const priority = getEventPriority(event.eventType);
      return {
        id: event.id,
        label: event.eventType,
        studentName: event.userName || "-",
        timeLabel: formatTime(event.timestamp),
        tone: priority === 0 ? "danger" : priority === 1 ? "warning" : "neutral",
      };
    });

export const buildAdminOverviewDashboard = ({
  contest,
  participants,
  examEvents,
  overviewMetrics,
  gradingStats,
  now = new Date(),
}: {
  contest: ContestDetail;
  participants: ContestParticipant[];
  examEvents: ExamEvent[];
  overviewMetrics: ContestOverviewMetrics | null;
  gradingStats?: GlobalStats;
  now?: Date;
}): AdminOverviewDashboardData => {
  const students = studentParticipants(participants);
  const total = students.length || contest.participantCount || 0;
  const started = students.filter((p) => p.examStatus !== "not_started").length;
  const submitted = students.filter((p) => p.examStatus === "submitted").length;
  const locked = students.filter((p) => p.examStatus === "locked" || p.examStatus === "paused").length;
  const attentionRows = getTeacherAttentionRows({ participants, examEvents, limit: 5 });
  const liveTimeProgress = overviewMetrics?.timeProgress || calculateContestTimeProgressAt(contest, now.getTime());
  const gradedAnswers = gradingStats?.gradedAnswers ?? 0;
  const totalAnswers = gradingStats?.totalAnswers ?? 0;
  const gradingPercent = totalAnswers > 0 ? Math.round((gradedAnswers / totalAnswers) * 100) : 0;
  const workItemCount = contest.contestType === "paper_exam" ? contest.examQuestionsCount : contest.problems.length;

  return {
    kpis: [
      { key: "online", label: "在線考生", value: `${overviewMetrics?.onlineNow ?? 0} / ${total}`, tone: "neutral" },
      { key: "started", label: "已開始", value: String(started), tone: "neutral" },
      { key: "submitted", label: "已交卷", value: String(submitted), tone: "neutral" },
      { key: "locked", label: "鎖定", value: String(locked), tone: locked > 0 ? "danger" : "neutral" },
      { key: "attention", label: "待處理事件", value: String(attentionRows.length), tone: attentionRows.length > 0 ? "warning" : "neutral" },
    ],
    attentionRows,
    distribution: buildDistribution(participants),
    examStatus: {
      timeWindowLabel: formatWindow(contest),
      remainingLabel: liveTimeProgress.isEnded ? "已結束" : formatDuration(liveTimeProgress.remainingSeconds),
      timeProgressPercent: liveTimeProgress.progressPercent,
      resultsLabel: contest.resultsPublished ? "已發布" : "未發布",
      gradingLabel: totalAnswers > 0 ? `${gradingPercent}%` : "尚無批改資料",
      workItemLabel: contest.contestType === "paper_exam" ? "考卷題目" : "程式題目",
      workItemCount,
    },
    recentEvents: buildRecentEvents(examEvents),
    nextActions: [
      {
        key: "attention",
        title: "處理異常",
        description: attentionRows.length > 0 ? `${attentionRows.length} 位考生需要確認` : "目前沒有待處理異常",
        panelTarget: "participants",
        disabled: attentionRows.length === 0,
      },
      {
        key: "grading",
        title: "前往批改",
        description: totalAnswers > 0 ? `已批改 ${gradingPercent}%` : "考後可開始批改",
        panelTarget: "grading",
      },
      {
        key: "results",
        title: "發布成績",
        description: contest.resultsPublished ? "成績已發布" : "確認批改後發布",
        panelTarget: "grading",
        disabled: contest.resultsPublished,
      },
    ],
  };
};
```

- [ ] **Step 4: Run model tests**

Run:

```bash
npx vitest run frontend/src/features/contest/screens/admin/panels/adminOverviewDashboard.model.test.ts
```

Expected: PASS.

---

### Task 2: Build the Teacher Command-Center Component

**Files:**
- Create: `frontend/src/features/contest/components/admin/AdminOverviewCommandCenter.tsx`
- Create: `frontend/src/features/contest/components/admin/AdminOverviewCommandCenter.module.scss`
- Create: `frontend/src/features/contest/components/admin/AdminOverviewCommandCenter.test.tsx`

- [ ] **Step 1: Write rendering tests**

Create `frontend/src/features/contest/components/admin/AdminOverviewCommandCenter.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AdminOverviewCommandCenter from "./AdminOverviewCommandCenter";
import type { AdminOverviewDashboardData } from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";

const data: AdminOverviewDashboardData = {
  kpis: [
    { key: "online", label: "在線考生", value: "96 / 128", tone: "neutral" },
    { key: "started", label: "已開始", value: "104", tone: "neutral" },
    { key: "submitted", label: "已交卷", value: "21", tone: "neutral" },
    { key: "locked", label: "鎖定", value: "3", tone: "danger" },
    { key: "attention", label: "待處理事件", value: "5", tone: "warning" },
  ],
  attentionRows: [
    {
      id: "1",
      userId: "1",
      studentName: "王小明",
      kind: "locked",
      statusLabel: "鎖定",
      eventLabel: "考試已鎖定",
      timeLabel: "10:12",
      panelTarget: "participants",
    },
  ],
  distribution: [
    { key: "in_progress", label: "作答中", value: 80, percent: 63 },
    { key: "not_started", label: "未開始", value: 20, percent: 16 },
    { key: "submitted", label: "已交卷", value: 21, percent: 16 },
    { key: "locked", label: "鎖定", value: 3, percent: 2 },
    { key: "offline", label: "離線", value: 4, percent: 3 },
  ],
  examStatus: {
    timeWindowLabel: "09:00-11:00",
    remainingLabel: "45m",
    timeProgressPercent: 62,
    resultsLabel: "未發布",
    gradingLabel: "82%",
    workItemLabel: "考卷題目",
    workItemCount: 12,
  },
  recentEvents: [
    { id: "e1", label: "auto_submit", studentName: "陳小華", timeLabel: "10:08", tone: "neutral" },
  ],
  nextActions: [
    { key: "attention", title: "處理異常", description: "1 位考生需要確認", panelTarget: "participants" },
    { key: "grading", title: "前往批改", description: "已批改 82%", panelTarget: "grading" },
    { key: "results", title: "發布成績", description: "確認批改後發布", panelTarget: "grading" },
  ],
};

describe("AdminOverviewCommandCenter", () => {
  it("renders teacher overview sections without monitoring sources or submission trends", () => {
    render(<AdminOverviewCommandCenter data={data} onOpenPanel={vi.fn()} />);

    expect(screen.getByText("待處理考生")).toBeInTheDocument();
    expect(screen.getByText("考務狀態")).toBeInTheDocument();
    expect(screen.getByText("考生分布")).toBeInTheDocument();
    expect(screen.getByText("考務事件")).toBeInTheDocument();
    expect(screen.getByText("下一步")).toBeInTheDocument();
    expect(screen.queryByText(/webcam|screen share|fullscreen|監控來源/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/提交趨勢|submission trend/i)).not.toBeInTheDocument();
  });

  it("opens the target admin panel from row actions", async () => {
    const onOpenPanel = vi.fn();
    render(<AdminOverviewCommandCenter data={data} onOpenPanel={onOpenPanel} />);

    await userEvent.click(screen.getByRole("button", { name: "處理 王小明" }));

    expect(onOpenPanel).toHaveBeenCalledWith("participants");
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npx vitest run frontend/src/features/contest/components/admin/AdminOverviewCommandCenter.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement component**

Create `frontend/src/features/contest/components/admin/AdminOverviewCommandCenter.tsx`:

```tsx
import {
  Button,
  DataTable,
  ProgressBar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Tile,
} from "@carbon/react";
import { Warning, UserFollow, ChartBar, TaskComplete } from "@carbon/icons-react";
import type { AdminPanelId } from "@/features/contest/modules/types";
import type {
  AdminOverviewDashboardData,
  AttentionKind,
} from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";
import styles from "./AdminOverviewCommandCenter.module.scss";

interface AdminOverviewCommandCenterProps {
  data: AdminOverviewDashboardData;
  onOpenPanel: (panel: AdminPanelId) => void;
}

const attentionTagType = (kind: AttentionKind) => {
  if (kind === "locked") return "red";
  if (kind === "violation") return "orange";
  if (kind === "offline") return "yellow";
  return "gray";
};

export default function AdminOverviewCommandCenter({
  data,
  onOpenPanel,
}: AdminOverviewCommandCenterProps) {
  const attentionHeaders = [
    { key: "status", header: "狀態" },
    { key: "student", header: "考生" },
    { key: "event", header: "事件" },
    { key: "time", header: "時間" },
    { key: "action", header: "操作" },
  ];
  const attentionRows = data.attentionRows.map((row) => ({
    id: row.id,
    status: row.statusLabel,
    student: row.studentName,
    event: row.eventLabel,
    time: row.timeLabel,
    action: row,
  }));

  return (
    <section className={styles.root} aria-label="教師管理總覽">
      <div className={styles.kpiGrid}>
        {data.kpis.map((item) => {
          const Icon = item.key === "attention" || item.key === "locked" ? Warning : UserFollow;
          return (
            <Tile key={item.key} className={`${styles.kpiTile} ${styles[`tone-${item.tone}`]}`}>
              <div className={styles.kpiHeader}>
                <Icon size={18} />
                <span>{item.label}</span>
              </div>
              <div className={styles.kpiValue}>{item.value}</div>
            </Tile>
          );
        })}
      </div>

      <div className={styles.primaryGrid}>
        <Tile className={styles.attentionPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h3>待處理考生</h3>
              <p>只列出需要老師立即確認的狀態。</p>
            </div>
            <Button kind="ghost" onClick={() => onOpenPanel("participants")}>
              查看全部
            </Button>
          </div>
          <DataTable rows={attentionRows} headers={attentionHeaders} size="lg">
            {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
              <TableContainer>
                <Table {...getTableProps()}>
                  <TableHead>
                    <TableRow>
                      {headers.map((header) => (
                        <TableHeader {...getHeaderProps({ header })} key={header.key}>
                          {header.header}
                        </TableHeader>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row) => {
                      const source = data.attentionRows.find((item) => item.id === row.id);
                      return (
                        <TableRow {...getRowProps({ row })} key={row.id}>
                          <TableCell>
                            <Tag size="sm" type={source ? attentionTagType(source.kind) : "gray"}>
                              {source?.statusLabel}
                            </Tag>
                          </TableCell>
                          <TableCell>{source?.studentName}</TableCell>
                          <TableCell>{source?.eventLabel}</TableCell>
                          <TableCell>{source?.timeLabel}</TableCell>
                          <TableCell>
                            <Button
                              kind="ghost"
                              size="sm"
                              aria-label={`處理 ${source?.studentName}`}
                              onClick={() => source && onOpenPanel(source.panelTarget)}
                            >
                              處理
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
        </Tile>

        <Tile className={styles.statusPanel}>
          <div className={styles.panelHeaderCompact}>
            <h3>考務狀態</h3>
          </div>
          <ProgressBar
            label="時間進度"
            value={data.examStatus.timeProgressPercent}
            size="small"
          />
          <dl className={styles.statusList}>
            <div>
              <dt>考試時間</dt>
              <dd>{data.examStatus.timeWindowLabel}</dd>
            </div>
            <div>
              <dt>剩餘時間</dt>
              <dd>{data.examStatus.remainingLabel}</dd>
            </div>
            <div>
              <dt>{data.examStatus.workItemLabel}</dt>
              <dd>{data.examStatus.workItemCount}</dd>
            </div>
            <div>
              <dt>批改進度</dt>
              <dd>{data.examStatus.gradingLabel}</dd>
            </div>
            <div>
              <dt>成績狀態</dt>
              <dd>{data.examStatus.resultsLabel}</dd>
            </div>
          </dl>
        </Tile>
      </div>

      <div className={styles.secondaryGrid}>
        <Tile className={styles.panel}>
          <div className={styles.panelTitleRow}>
            <ChartBar size={18} />
            <h3>考生分布</h3>
          </div>
          <div className={styles.distributionList}>
            {data.distribution.map((item) => (
              <div key={item.key} className={styles.distributionItem}>
                <div className={styles.distributionMeta}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
                <ProgressBar label={item.label} hideLabel size="small" value={item.percent} />
              </div>
            ))}
          </div>
        </Tile>

        <Tile className={styles.panel}>
          <div className={styles.panelTitleRow}>
            <Warning size={18} />
            <h3>考務事件</h3>
          </div>
          <ul className={styles.eventList}>
            {data.recentEvents.length === 0 ? (
              <li className={styles.emptyState}>目前沒有事件</li>
            ) : (
              data.recentEvents.map((event) => (
                <li key={event.id}>
                  <span>{event.timeLabel}</span>
                  <strong>{event.label}</strong>
                  <span>{event.studentName}</span>
                </li>
              ))
            )}
          </ul>
        </Tile>

        <Tile className={styles.panel}>
          <div className={styles.panelTitleRow}>
            <TaskComplete size={18} />
            <h3>下一步</h3>
          </div>
          <div className={styles.nextActionList}>
            {data.nextActions.map((action) => (
              <Button
                key={action.key}
                kind={action.key === "attention" ? "primary" : "tertiary"}
                disabled={action.disabled}
                onClick={() => onOpenPanel(action.panelTarget)}
              >
                <span className={styles.nextActionText}>
                  <span>{action.title}</span>
                  <small>{action.description}</small>
                </span>
              </Button>
            ))}
          </div>
        </Tile>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Implement SCSS**

Create `frontend/src/features/contest/components/admin/AdminOverviewCommandCenter.module.scss`:

```scss
.root {
  display: grid;
  gap: 1rem;
}

.kpiGrid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1rem;
}

.kpiTile,
.panel,
.attentionPanel,
.statusPanel {
  border: 1px solid var(--cds-border-subtle);
  background: var(--cds-layer-01);
}

.kpiTile {
  display: grid;
  gap: 0.75rem;
  min-height: 6.5rem;
}

.kpiHeader {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--cds-text-secondary);
  font-size: var(--cds-label-01-font-size, 0.75rem);
}

.kpiValue {
  color: var(--cds-text-primary);
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.2;
}

.tone-warning {
  border-color: var(--cds-support-warning);
}

.tone-danger {
  border-color: var(--cds-support-error);
}

.primaryGrid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(20rem, 0.85fr);
  gap: 1rem;
}

.secondaryGrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.panelHeader,
.panelHeaderCompact,
.panelTitleRow {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.panelHeader h3,
.panelHeaderCompact h3,
.panelTitleRow h3 {
  margin: 0;
  color: var(--cds-text-primary);
  font-size: 1rem;
  font-weight: 600;
}

.panelHeader p {
  margin: 0.25rem 0 0;
  color: var(--cds-text-secondary);
  font-size: var(--cds-body-compact-01-font-size, 0.875rem);
}

.statusList {
  display: grid;
  gap: 0.75rem;
  margin: 1rem 0 0;
}

.statusList div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.statusList dt,
.statusList dd {
  margin: 0;
  font-size: var(--cds-body-compact-01-font-size, 0.875rem);
}

.statusList dt {
  color: var(--cds-text-secondary);
}

.statusList dd {
  color: var(--cds-text-primary);
  font-weight: 600;
}

.distributionList,
.nextActionList {
  display: grid;
  gap: 0.875rem;
}

.distributionItem {
  display: grid;
  gap: 0.35rem;
}

.distributionMeta {
  display: flex;
  justify-content: space-between;
  color: var(--cds-text-secondary);
  font-size: var(--cds-body-compact-01-font-size, 0.875rem);
}

.distributionMeta strong {
  color: var(--cds-text-primary);
}

.eventList {
  display: grid;
  gap: 0.75rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.eventList li {
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
  color: var(--cds-text-secondary);
  font-size: var(--cds-body-compact-01-font-size, 0.875rem);
}

.eventList strong {
  color: var(--cds-text-primary);
  font-weight: 500;
}

.emptyState {
  grid-template-columns: 1fr !important;
}

.nextActionText {
  display: grid;
  gap: 0.125rem;
  text-align: left;
}

.nextActionText small {
  color: inherit;
  opacity: 0.78;
  font-size: var(--cds-label-01-font-size, 0.75rem);
}

@media (max-width: 1056px) {
  .kpiGrid,
  .primaryGrid,
  .secondaryGrid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Run component test**

Run:

```bash
npx vitest run frontend/src/features/contest/components/admin/AdminOverviewCommandCenter.test.tsx
```

Expected: PASS.

---

### Task 3: Recompose AdminOverviewScreen

**Files:**
- Modify: `frontend/src/features/contest/screens/admin/panels/AdminOverviewScreen.tsx`
- Modify: `frontend/src/features/contest/screens/admin/panels/AdminOverviewScreen.module.scss`

- [ ] **Step 1: Write/update integration test**

Add a test in `frontend/src/features/contest/screens/admin/AdminDashboardScreen.test.tsx` or the existing admin overview test file if one exists:

```tsx
it("shows the teacher command center on the overview panel", async () => {
  renderAdminDashboard({ panel: "overview" });

  expect(await screen.findByText("待處理考生")).toBeInTheDocument();
  expect(screen.getByText("考務狀態")).toBeInTheDocument();
  expect(screen.getByText("考生分布")).toBeInTheDocument();
  expect(screen.queryByText(/監控來源|webcam|screen share/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/提交趨勢|submission trend/i)).not.toBeInTheDocument();
});
```

Use the test helper already present in that test file. If no helper exists, render `AdminOverviewScreen` with mocked `useContest`, `useContestAdmin`, and `useGradingData` following the existing mock style.

- [ ] **Step 2: Run the affected test**

Run:

```bash
npx vitest run frontend/src/features/contest/screens/admin/AdminDashboardScreen.test.tsx
```

Expected: FAIL until the new command center is wired.

- [ ] **Step 3: Wire model and component into AdminOverviewScreen**

In `frontend/src/features/contest/screens/admin/panels/AdminOverviewScreen.tsx`:

```tsx
import AdminOverviewCommandCenter from "@/features/contest/components/admin/AdminOverviewCommandCenter";
import { buildAdminOverviewDashboard } from "./adminOverviewDashboard.model";
```

Add `overviewMetrics` to the admin context destructure:

```tsx
const {
  participants,
  examEvents,
  overviewMetrics,
  initialLoading,
  refreshAllAdminData,
} = useContestAdmin();
```

Add derived dashboard data after `globalStats`:

```tsx
const dashboardData = useMemo(() => {
  if (!contest) return null;
  return buildAdminOverviewDashboard({
    contest,
    participants,
    examEvents,
    overviewMetrics,
    gradingStats: globalStats,
  });
}, [contest, participants, examEvents, overviewMetrics, globalStats]);
```

Replace the current `EntityOverviewFrame` `main` content:

```tsx
main={
  <div className={styles.mainColumn}>
    {dashboardData && (
      <AdminOverviewCommandCenter
        data={dashboardData}
        onOpenPanel={openPanel}
      />
    )}
    <OverviewActionWidgets
      contest={contest}
      kpi={kpi}
      gradingStats={globalStats}
      violationCount={violationCount}
      loading={initialLoading}
      onOpenPanel={openPanel}
      onOpenChecklist={() => setChecklistOpen(true)}
      onOpenScheduleSettings={handleOpenScheduleEditor}
      onPublishContest={handlePublishContest}
      onRevertContestToDraft={handleRevertContestToDraft}
      onPublishResults={handlePublishResults}
      onRevokeResults={handleRevokeResults}
      onToggleStrictMode={handleToggleStrictMode}
      onRequestToggleAllowMultipleJoins={handleRequestToggleAllowMultipleJoins}
      onRequestTogglePassword={handleRequestTogglePassword}
    />
  </div>
}
```

Then reduce `OverviewActionWidgets` visually in Task 4; keep it temporarily so existing publish/settings controls remain reachable while tests are updated.

- [ ] **Step 4: Run integration test**

Run:

```bash
npx vitest run frontend/src/features/contest/screens/admin/AdminDashboardScreen.test.tsx
```

Expected: PASS after mocks are adjusted.

---

### Task 4: Reduce Existing Widgets to Secondary Actions

**Files:**
- Modify: `frontend/src/features/contest/components/admin/OverviewActionWidgets.tsx`
- Modify: `frontend/src/features/contest/components/admin/OverviewActionWidgets.module.scss`
- Modify: `frontend/src/features/contest/components/admin/OverviewActionWidgets.test.tsx`

- [ ] **Step 1: Update widget tests**

In `OverviewActionWidgets.test.tsx`, keep behavior tests for:
- publish contest
- revert to draft
- publish/revoke results
- strict mode toggle
- schedule settings
- password toggle

Remove expectations that the widget section is the primary overview dashboard. Add:

```tsx
expect(screen.getByRole("heading", { name: "管理操作" })).toBeInTheDocument();
expect(screen.queryByText("待處理考生")).not.toBeInTheDocument();
```

- [ ] **Step 2: Refactor section copy**

In `OverviewActionWidgets.tsx`, change header fallback labels:

```tsx
<h3 className={styles.title}>{t("adminOverview.widgets.title", "管理操作")}</h3>
<p className={styles.subtitle}>{t("adminOverview.widgets.subtitle", "發布、設定與成績操作")}</p>
```

- [ ] **Step 3: Reduce visual weight in SCSS**

In `OverviewActionWidgets.module.scss`, reduce card density:

```scss
.section {
  display: grid;
  gap: 0.75rem;
}

.grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.widgetCard {
  min-height: auto;
}
```

Keep existing class names; do not override `.cds--*` selectors and do not use `!important`.

- [ ] **Step 4: Run widget tests**

Run:

```bash
npx vitest run frontend/src/features/contest/components/admin/OverviewActionWidgets.test.tsx
```

Expected: PASS.

---

### Task 5: Compact the Contest Header

**Files:**
- Modify: `frontend/src/features/contest/components/admin/KpiCards.tsx`
- Modify: `frontend/src/features/contest/components/admin/KpiCards.test.tsx`

- [ ] **Step 1: Update tests**

In `KpiCards.test.tsx`, assert that the header exposes:
- contest name
- status tag
- settings action
- open contest homepage action

Remove expectations that duplicate the command-center KPI tiles.

- [ ] **Step 2: Keep only identity and top-level actions**

In `KpiCards.tsx`, keep `QJudgeHeroWidget`, but reduce KPI cards to only:

```tsx
kpiCards={
  <>
    <KpiCard
      icon={UserMultiple}
      value={participantCount}
      unit={t("adminOverview.kpi.personUnit", "人")}
      label={t("adminOverview.kpi.participantCount", "參賽者")}
      showBorder={false}
    />
    <KpiCard
      icon={Education}
      value={examTypeLabel}
      label={t("adminOverview.kpi.examMode", "考試類型")}
      showBorder={false}
    />
  </>
}
```

Do not add monitoring source cards here.

- [ ] **Step 3: Run header tests**

Run:

```bash
npx vitest run frontend/src/features/contest/components/admin/KpiCards.test.tsx
```

Expected: PASS.

---

### Task 6: Responsive and Carbon Style Verification

**Files:**
- Verify: all modified SCSS/TSX files.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npx vitest run \
  frontend/src/features/contest/screens/admin/panels/adminOverviewDashboard.model.test.ts \
  frontend/src/features/contest/components/admin/AdminOverviewCommandCenter.test.tsx \
  frontend/src/features/contest/components/admin/OverviewActionWidgets.test.tsx \
  frontend/src/features/contest/components/admin/KpiCards.test.tsx \
  frontend/src/features/contest/screens/admin/AdminDashboardScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript build**

Run:

```bash
npx tsc -b --pretty false
```

Expected: PASS.

- [ ] **Step 3: Run Carbon style gate**

Run:

```bash
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh
```

Expected: PASS or only pre-existing unrelated violations. Any new `.cds--*`, `.bx--*`, or `!important` violation in the touched files must be fixed.

- [ ] **Step 4: Manual browser check**

Start the frontend using the repo's standard dev command, then inspect admin overview at desktop and tablet widths:

```bash
npm run dev
```

Check:
- Overview has one clear vertical scroll owner.
- KPI row does not wrap awkwardly.
- "待處理考生" table remains readable.
- No monitoring source details are visible.
- No submission trend chart is visible.
- Paper exam contest still shows generic exam labels.

---

## Rollout Notes

- This plan deliberately keeps `OverviewActionWidgets` as a secondary operation section to avoid losing existing publish/settings behavior.
- If the final page still feels too long after implementation, collapse `管理操作` behind a single "更多管理操作" tile in a follow-up.
- If teachers need deeper triage, link from rows to `participants` or `logs`; do not embed evidence or live monitoring source details in overview.

## Self-Review

- Spec coverage: teacher-oriented overview, lower density, no monitoring source details, no submission trend, paper exam compatibility, and current-data-only implementation are covered.
- Placeholder scan: no TBD/TODO/fill-later steps remain.
- Type consistency: `AdminOverviewDashboardData`, `TeacherAttentionRow`, and `AdminPanelId` are defined before use and referenced consistently.
