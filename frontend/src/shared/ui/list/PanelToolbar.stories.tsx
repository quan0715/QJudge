import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@carbon/react";
import { Add, DocumentExport, Filter, Menu, Search, Upload, View } from "@carbon/icons-react";
import { PanelToolbar } from "./PanelToolbar";

const meta = {
  title: "shared/ui/list/PanelToolbar",
  component: PanelToolbar,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "分欄／主內容區頂部的窄列工具列：左側為選單按鈕（可選）、標題與狀態；右側為搜尋／篩選／圖示操作等。對齊競賽後台考試編輯器與參與者列表的視覺密度（2.5rem 高）。",
      },
    },
  },
  decorators: [
    (Story) => (
      <div
        style={{
          maxWidth: 960,
          border: "1px solid var(--cds-border-subtle-01)",
          background: "var(--cds-background)",
        }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PanelToolbar>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Controls：標題與鎖定提示文案；右側按鈕為固定展示。 */
type PlaygroundArgs = {
  title: string;
  lockedHint: string;
};

export const Playground: StoryObj<PlaygroundArgs> = {
  name: "Playground",
  args: {
    title: "題目管理",
    lockedHint: "",
  },
  argTypes: {
    title: { control: "text", description: "工具列主標題" },
    lockedHint: {
      control: "text",
      description: "狀態列說明（留空則不顯示）。例如：已有學生作答，題目已鎖定。",
    },
  },
  render: ({ title, lockedHint }) => (
    <PanelToolbar
      title={title}
      status={
        lockedHint ? (
          <span
            style={{
              color: "var(--cds-text-secondary)",
              fontSize: "0.75rem",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "min(420px, 40vw)",
            }}
          >
            {lockedHint}
          </span>
        ) : undefined
      }
      actions={
        <>
          <Button kind="ghost" hasIconOnly renderIcon={Upload} iconDescription="匯入 JSON" />
          <Button kind="ghost" hasIconOnly renderIcon={DocumentExport} iconDescription="匯出" />
          <Button kind="ghost" hasIconOnly renderIcon={View} iconDescription="預覽" />
          <Button kind="primary" hasIconOnly renderIcon={Add} iconDescription="新增題目" />
        </>
      }
    />
  ),
};

export const WithLeftActions: Story = {
  name: "含左側選單按鈕（考試編輯器）",
  render: () => (
    <PanelToolbar
      leftActions={(
        <Button kind="ghost" hasIconOnly renderIcon={Menu} iconDescription="顯示或隱藏題目列表" />
      )}
      title="題目管理"
      status={
        <span style={{ color: "var(--cds-support-warning)", fontSize: "0.75rem" }}>
          儲存中…
        </span>
      }
      actions={
        <>
          <Button kind="ghost" hasIconOnly renderIcon={Upload} iconDescription="匯入 JSON" />
          <Button kind="ghost" hasIconOnly renderIcon={DocumentExport} iconDescription="匯出" />
          <Button kind="ghost" hasIconOnly renderIcon={View} iconDescription="預覽" />
          <Button kind="primary" hasIconOnly renderIcon={Add} iconDescription="新增題目" />
        </>
      }
    />
  ),
};

export const ParticipantsChrome: Story = {
  name: "參與者列表（右側搜尋＋篩選）",
  render: () => (
    <PanelToolbar
      title="檢視參與者"
      actions={
        <>
          <Button kind="ghost" hasIconOnly renderIcon={Search} iconDescription="搜尋" />
          <Button kind="ghost" hasIconOnly renderIcon={Filter} iconDescription="篩選" />
          <Button kind="ghost" hasIconOnly renderIcon={DocumentExport} iconDescription="匯出 CSV" />
          <Button kind="primary" hasIconOnly renderIcon={Add} iconDescription="新增參賽者" />
        </>
      }
    />
  ),
};

export const LockedExam: Story = {
  name: "鎖定狀態與停用操作",
  render: () => (
    <PanelToolbar
      title="題目管理"
      status={
        <span style={{ color: "var(--cds-support-warning)", fontSize: "0.75rem" }}>
          已有學生正式作答，競賽題目已鎖定
        </span>
      }
      actions={
        <>
          <Button kind="ghost" hasIconOnly renderIcon={Upload} iconDescription="匯入 JSON" />
          <Button kind="ghost" hasIconOnly renderIcon={DocumentExport} iconDescription="匯出" disabled />
          <Button kind="primary" hasIconOnly renderIcon={Add} iconDescription="新增題目" disabled />
        </>
      }
    />
  ),
};

export const TitleOnly: Story = {
  name: "僅標題",
  render: () => <PanelToolbar title="作答列表" />,
};
