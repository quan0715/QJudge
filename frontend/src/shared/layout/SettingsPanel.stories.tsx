import { Button, TextInput, Toggle, NumberInput, Select, SelectItem } from "@carbon/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Section, FieldRow, ActionRow } from "./SettingsPanel";

const meta: Meta = {
  title: "shared/layout/SettingsPanel",
  parameters: {
    docs: {
      description: {
        component:
          "Settings 頁面的 layout 基礎元件。`Section` 分群、`FieldRow` 放全寬控件、`ActionRow` 放 label↔控件 的橫向排版。用於 Contest / Classroom / Auth 各種設定頁面。",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const AllPrimitives: Story = {
  parameters: {
    docs: {
      description: { story: "完整展示 Section > FieldRow + ActionRow 的組合。" },
    },
  },
  render: () => (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <Section title="基本資訊" description="這些資訊會顯示在公開頁面上">
        <FieldRow label="名稱" description="顯示在列表和頁首的名稱">
          <TextInput id="sp-name" labelText="" placeholder="輸入名稱" />
        </FieldRow>
        <FieldRow label="描述">
          <TextInput id="sp-desc" labelText="" placeholder="簡短描述" />
        </FieldRow>
      </Section>

      <Section
        title="狀態與權限"
        action={<Button kind="ghost" size="sm">重設</Button>}
      >
        <ActionRow label="公開狀態" description="Published 後學生即可加入">
          <Select id="sp-status" labelText="" hideLabel size="sm">
            <SelectItem value="draft" text="Draft" />
            <SelectItem value="published" text="Published" />
            <SelectItem value="archived" text="Archived" />
          </Select>
        </ActionRow>
        <ActionRow label="需要密碼" description="加入時需輸入密碼">
          <Toggle id="sp-password" labelA="關" labelB="開" size="sm" />
        </ActionRow>
      </Section>

      <Section title="進階設定">
        <ActionRow label="最大警告次數">
          <NumberInput id="sp-max" min={0} max={10} value={3} label="" hideLabel size="sm" />
        </ActionRow>
      </Section>
    </div>
  ),
};

export const SectionVariants: Story = {
  parameters: {
    docs: {
      description: { story: "Section 的各種變體：有/無 description、有/無 action。" },
    },
  },
  render: () => (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <Section title="只有標題">
        <ActionRow label="Toggle">
          <Toggle id="sv-1" labelA="關" labelB="開" size="sm" />
        </ActionRow>
      </Section>

      <Section title="有描述" description="這段文字會顯示在標題下方，用來補充說明">
        <ActionRow label="Toggle">
          <Toggle id="sv-2" labelA="關" labelB="開" size="sm" />
        </ActionRow>
      </Section>

      <Section title="有 Action" action={<Button kind="ghost" size="sm">編輯</Button>}>
        <ActionRow label="Toggle">
          <Toggle id="sv-3" labelA="關" labelB="開" size="sm" />
        </ActionRow>
      </Section>

      <Section
        title="完整版"
        description="同時有描述和 action"
        action={<Button kind="danger--ghost" size="sm">重設</Button>}
      >
        <ActionRow label="Toggle">
          <Toggle id="sv-4" labelA="關" labelB="開" size="sm" />
        </ActionRow>
      </Section>
    </div>
  ),
};

export const FieldRowPlayground: Story = {
  parameters: {
    docs: {
      description: { story: "FieldRow 搭配不同的 Carbon 控件：TextInput, NumberInput, Toggle。" },
    },
  },
  render: () => (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <Section title="FieldRow 展示">
        <FieldRow label="文字輸入" description="一般的 TextInput">
          <TextInput id="fr-text" labelText="" placeholder="輸入文字" />
        </FieldRow>
        <FieldRow label="數字輸入" description="NumberInput，有最大最小值限制">
          <NumberInput id="fr-num" min={1} max={100} value={10} label="" hideLabel />
        </FieldRow>
        <FieldRow label="無描述的欄位">
          <TextInput id="fr-nodesc" labelText="" placeholder="沒有 description" />
        </FieldRow>
      </Section>
    </div>
  ),
};

export const ActionRowPlayground: Story = {
  parameters: {
    docs: {
      description: { story: "ActionRow 搭配不同的 inline 控件：Toggle, Select, Button。" },
    },
  },
  render: () => (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <Section title="ActionRow 展示">
        <ActionRow label="Toggle 控件" description="最常見的用法，左邊文字右邊 Toggle">
          <Toggle id="ar-toggle" labelA="關" labelB="開" size="sm" />
        </ActionRow>
        <ActionRow label="Select 控件" description="下拉選單放在右邊">
          <Select id="ar-select" labelText="" hideLabel size="sm">
            <SelectItem value="a" text="選項 A" />
            <SelectItem value="b" text="選項 B" />
          </Select>
        </ActionRow>
        <ActionRow label="Button 控件" description="動作按鈕放在右邊">
          <Button kind="secondary" size="sm">執行動作</Button>
        </ActionRow>
      </Section>
    </div>
  ),
};
