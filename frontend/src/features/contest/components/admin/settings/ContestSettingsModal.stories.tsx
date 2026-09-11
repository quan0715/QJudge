import { useState } from "react";
import { Button } from "@carbon/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createMockContest, stubT } from "@/shared/mocks/contest.mock";
import { ThemeProvider } from "@/shared/ui/theme/ThemeContext";
import type { ContestSettingsPanelProps } from "./contestSettingsPanel.types";
import GeneralSettingsPanel from "./GeneralSettingsPanel";
import AccessSettingsPanel from "./AccessSettingsPanel";
import DisplaySettingsPanel from "./DisplaySettingsPanel";
import CheatDetectionPanel from "./CheatDetectionPanel";
import ContestSettingsModal from "./ContestSettingsModal";
import { sanitizeAnticheatPolicy } from "./anticheatPolicyUtils";

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
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "設定 Modal 及其 4 個 panel：基本資訊、存取控制與權限、競賽設定、防作弊監控設定。自動儲存狀態只顯示在目前編輯的 section 標題旁。",
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
        story: "基本資訊 panel：唯讀考試型態、名稱、描述、開始/結束時間、規則 (Markdown)。",
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
        story: "存取控制與權限 panel：發布狀態、QR 簽到、允許重新登入與接管、Danger Zone（封存/刪除）。",
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
        story: "競賽設定 panel：競賽期間排行榜可見性。",
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
        story: "防作弊監控 panel：主開關、作答裝置政策、證據追蹤（螢幕分享 / Webcam）與平板限制提示。",
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

/* ── Section save state ──────────────────────────────────────── */

export const SectionSaveState: Story = {
  parameters: {
    docs: {
      description: {
        story: "自動儲存狀態彙整在 section 標題旁：同一 section 內任一欄位儲存中、已儲存或失敗時只顯示一次。",
      },
    },
  },
  render: function SectionSaveStateStory() {
    const { sharedProps } = useFormState();

    return (
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <AccessSettingsPanel
          {...sharedProps}
          getState={(field) =>
            field === "allowMultipleJoins" ? { status: "saving" } : undefined
          }
          onArchive={() => {}}
          onDelete={() => {}}
        />
        <DisplaySettingsPanel
          {...sharedProps}
          getState={(field) =>
            field === "scoreboardVisibleDuringContest"
              ? { status: "error", error: "儲存失敗" }
              : undefined
          }
        />
      </div>
    );
  },
};

/* ── Tablet without webcam ───────────────────────────────────── */

export const CheatDetectionTabletWithoutWebcam: Story = {
  parameters: {
    docs: {
      description: {
        story: "允許平板但未開啟 Webcam：顯示平板暫時無法使用螢幕分享的提示。",
      },
    },
  },
  render: function TabletWithoutWebcamStory() {
    const { sharedProps } = useFormState();
    const policy = sanitizeAnticheatPolicy(mockContest.anticheatDevicePolicy);
    sharedProps.form = {
      ...sharedProps.form,
      cheatDetectionEnabled: true,
      anticheatDevicePolicy: {
        ...policy,
        tablet: {
          ...policy.tablet,
          sources: { ...policy.tablet.sources, webcam: { enabled: false } },
        },
      },
    };

    return (
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <CheatDetectionPanel {...sharedProps} />
      </div>
    );
  },
};
