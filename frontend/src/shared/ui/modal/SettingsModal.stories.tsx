import { useState } from "react";
import { Button, TextInput, Toggle, NumberInput } from "@carbon/react";
import { Settings, UserMultiple, Security, View } from "@carbon/icons-react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SettingsModal, type SettingsModalProps, type SettingsModalNavItem } from "./SettingsModal";
import { Section, FieldRow, ActionRow } from "@/shared/layout/SettingsPanel";

const DemoTrigger = (props: Omit<SettingsModalProps, "open" | "onRequestClose">) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>開啟 Settings Modal</Button>
      <SettingsModal {...props} open={open} onRequestClose={() => setOpen(false)} />
    </>
  );
};

const dummyNavItems: SettingsModalNavItem[] = [
  { id: "general", label: "一般設定", icon: Settings },
  { id: "members", label: "成員管理", icon: UserMultiple },
  { id: "security", label: "安全性", icon: Security },
];

const dummyRenderPanel = (activeId: string) => {
  switch (activeId) {
    case "general":
      return (
        <>
          <Section title="基本資訊">
            <FieldRow label="名稱" description="顯示在列表中的名稱">
              <TextInput id="demo-name" labelText="" placeholder="輸入名稱" />
            </FieldRow>
            <FieldRow label="描述">
              <TextInput id="demo-desc" labelText="" placeholder="簡短描述" />
            </FieldRow>
          </Section>
          <Section title="進階設定">
            <ActionRow label="啟用通知" description="開啟後會傳送 email 通知">
              <Toggle id="demo-notify" labelA="關" labelB="開" size="sm" />
            </ActionRow>
          </Section>
        </>
      );
    case "members":
      return (
        <Section title="成員列表">
          <p style={{ color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
            這裡可以放成員 DataTable 或邀請功能。
          </p>
        </Section>
      );
    case "security":
      return (
        <Section title="安全性設定">
          <ActionRow label="需要密碼" description="加入時需輸入密碼">
            <Toggle id="demo-password" labelA="關" labelB="開" size="sm" />
          </ActionRow>
          <ActionRow label="最大嘗試次數">
            <NumberInput id="demo-max" min={0} max={10} value={3} label="" hideLabel size="sm" />
          </ActionRow>
        </Section>
      );
    default:
      return null;
  }
};

const meta: Meta<typeof SettingsModal> = {
  title: "shared/ui/modal/SettingsModal",
  component: SettingsModal,
  parameters: {
    docs: {
      description: {
        component:
          "帶有側邊導覽的設定 Modal。支援多 tab 切換、role-based tab 隱藏、桌面/行動裝置雙版面。已用於 Classroom Settings 和 User Settings。",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    docs: {
      description: { story: "互動式 3-tab demo，展示完整的 sidebar nav + panel 切換。" },
    },
  },
  render: () => (
    <DemoTrigger
      modalHeading="設定"
      navItems={dummyNavItems}
      renderPanel={dummyRenderPanel}
    />
  ),
};

export const TwoTabs: Story = {
  parameters: {
    docs: {
      description: { story: "最小用法：只有兩個 tab，類似 ClassroomSettingsModal。" },
    },
  },
  render: () => (
    <DemoTrigger
      modalHeading="教室設定"
      navItems={[
        { id: "general", label: "一般", icon: Settings },
        { id: "members", label: "成員", icon: UserMultiple },
      ]}
      renderPanel={(id) =>
        id === "general" ? (
          <Section title="一般設定">
            <FieldRow label="教室名稱">
              <TextInput id="cls-name" labelText="" defaultValue="演算法導論" />
            </FieldRow>
          </Section>
        ) : (
          <Section title="成員管理">
            <p style={{ color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
              成員列表...
            </p>
          </Section>
        )
      }
    />
  ),
};

export const WithHiddenTabs: Story = {
  parameters: {
    docs: {
      description: {
        story: "展示 `hidden: true` 的 role-based tab hiding。Security tab 被隱藏（模擬學生角色）。",
      },
    },
  },
  render: () => (
    <DemoTrigger
      modalHeading="設定"
      navItems={[
        { id: "general", label: "一般設定", icon: Settings },
        { id: "members", label: "成員管理", icon: UserMultiple },
        { id: "security", label: "安全性", icon: Security, hidden: true },
        { id: "display", label: "顯示設定", icon: View },
      ]}
      renderPanel={(id) => (
        <Section title={id}>
          <p style={{ color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
            {id === "security" ? "這個 tab 應該不會被看到" : `${id} 的內容`}
          </p>
        </Section>
      )}
    />
  ),
};
