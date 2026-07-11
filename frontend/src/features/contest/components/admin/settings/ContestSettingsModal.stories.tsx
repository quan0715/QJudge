import { useState } from "react";
import { Button } from "@carbon/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createMockContest, stubT } from "@/shared/mocks/contest.mock";
import type { ContestSettingsPanelProps } from "./ContestSettingsPanelProps";
import GeneralSettingsPanel from "./GeneralSettingsPanel";
import AccessSettingsPanel from "./AccessSettingsPanel";
import DisplaySettingsPanel from "./DisplaySettingsPanel";
import CheatDetectionPanel from "./CheatDetectionPanel";
import ContestSettingsModal from "./ContestSettingsModal";

/* ── Shared helpers ─────────────────────────────────────────── */

const mockContest = createMockContest();

const t = stubT as ContestSettingsPanelProps["t"];
const tc = stubT as ContestSettingsPanelProps["tc"];

function useFormState() {
  const [form, setForm] = useState<Record<string, unknown>>({
    name: mockContest.name,
    description: mockContest.description,
    rules: mockContest.rules,
    startTime: mockContest.startTime,
    endTime: mockContest.endTime,
    status: mockContest.status,
    attendanceCheckEnabled: mockContest.attendanceCheckEnabled,
    cheatDetectionEnabled: mockContest.cheatDetectionEnabled,
    anticheatDevicePolicy: mockContest.anticheatDevicePolicy,
    warningTimeoutSeconds: mockContest.warningTimeoutSeconds,
    screenShareRecoveryGraceMs: mockContest.screenShareRecoveryGraceMs,
    scoreboardVisibleDuringContest: mockContest.scoreboardVisibleDuringContest,
    allowMultipleJoins: mockContest.allowMultipleJoins,
  });

  const onChange = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const onConfirmedChange = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const sharedProps: ContestSettingsPanelProps = {
    t,
    tc,
    contest: mockContest,
    form,
    getState: () => undefined,
    onRetry: () => {},
    onChange,
    onConfirmedChange,
  };

  return { form, sharedProps };
}

/* ── Meta ────────────────────────────────────────────────────── */

const meta: Meta = {
  title: "features/contest/admin/ContestSettings",
  parameters: {
    docs: {
      description: {
        component:
          "競賽設定 Modal 及其 4 個 panel：基本資訊、狀態與權限、顯示設定、作弊檢查。使用 SettingsModal (shared) + AdminSettingsPanelLayout 組合。",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/* ── Full Modal ──────────────────────────────────────────────── */

export const FullModal: Story = {
  parameters: {
    docs: {
      description: {
        story: "完整的 ContestSettingsModal，包含 4 個 tab 可互動切換。",
      },
    },
  },
  render: function FullModalStory() {
    const [open, setOpen] = useState(false);
    const { sharedProps } = useFormState();
    const startDate = new Date(mockContest.startTime);
    const endDate = new Date(mockContest.endTime);

    return (
      <>
        <Button onClick={() => setOpen(true)}>開啟競賽設定</Button>
        <ContestSettingsModal
          open={open}
          onRequestClose={() => setOpen(false)}
          {...sharedProps}
          startDateInput={startDate}
          endDateInput={endDate}
          startTimeInput="09:00"
          endTimeInput="12:00"
          startMeridiem="AM"
          endMeridiem="PM"
          onStartDateChange={() => {}}
          onEndDateChange={() => {}}
          onStartTimeChange={() => {}}
          onEndTimeChange={() => {}}
          onStartMeridiemChange={() => {}}
          onEndMeridiemChange={() => {}}
          onArchive={() => console.log("archive")}
          onDelete={() => console.log("delete")}
        />
      </>
    );
  },
};

/* ── General Panel ───────────────────────────────────────────── */

export const General: Story = {
  parameters: {
    docs: {
      description: {
        story: "基本資訊 panel：名稱、描述、規則 (Markdown)、開始/結束時間。",
      },
    },
  },
  render: function GeneralStory() {
    const { sharedProps } = useFormState();
    const startDate = new Date(mockContest.startTime);
    const endDate = new Date(mockContest.endTime);

    return (
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <GeneralSettingsPanel
          {...sharedProps}
          startDateInput={startDate}
          endDateInput={endDate}
          startTimeInput="09:00"
          endTimeInput="12:00"
          startMeridiem="AM"
          endMeridiem="PM"
          onStartDateChange={() => {}}
          onEndDateChange={() => {}}
          onStartTimeChange={() => {}}
          onEndTimeChange={() => {}}
          onStartMeridiemChange={() => {}}
          onEndMeridiemChange={() => {}}
        />
      </div>
    );
  },
};

/* ── Access Panel ────────────────────────────────────────────── */

export const Access: Story = {
  parameters: {
    docs: {
      description: {
        story: "狀態與權限 panel：競賽狀態、密碼設定、允許重複加入、Danger Zone（封存/刪除）。",
      },
    },
  },
  render: function AccessStory() {
    const { sharedProps } = useFormState();

    return (
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <AccessSettingsPanel
          {...sharedProps}
          onArchive={() => console.log("archive")}
          onDelete={() => console.log("delete")}
        />
      </div>
    );
  },
};

/* ── Display Panel ───────────────────────────────────────────── */

export const Display: Story = {
  parameters: {
    docs: {
      description: {
        story: "顯示設定 panel：排行榜可見性。",
      },
    },
  },
  render: function DisplayStory() {
    const { sharedProps } = useFormState();

    return (
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <DisplaySettingsPanel {...sharedProps} />
      </div>
    );
  },
};

/* ── CheatDetection Panel ────────────────────────────────────── */

export const CheatDetection: Story = {
  parameters: {
    docs: {
      description: {
        story: "作弊檢查 panel：主開關、裝置政策 (Desktop/Tablet)、證據來源與人工介入流程。",
      },
    },
  },
  render: function CheatDetectionStory() {
    const { sharedProps } = useFormState();

    return (
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <CheatDetectionPanel {...sharedProps} />
      </div>
    );
  },
};

/* ── CheatDetection Disabled ─────────────────────────────────── */

export const CheatDetectionDisabled: Story = {
  parameters: {
    docs: {
      description: {
        story: "作弊檢查關閉時的 panel — 只顯示主開關。",
      },
    },
  },
  render: function CheatDetectionDisabledStory() {
    const { sharedProps } = useFormState();
    sharedProps.form = { ...sharedProps.form, cheatDetectionEnabled: false };

    return (
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <CheatDetectionPanel {...sharedProps} />
      </div>
    );
  },
};
