import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@carbon/react";
import { Add, Search, Filter, DocumentExport, Upload, View } from "@carbon/icons-react";
import { PanelToolbar } from "./PanelToolbar";

const meta: Meta = {
  title: "Shared/PanelToolbar",
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  name: "Title + Actions",
  render: () => (
    <PanelToolbar
      title="檢視參與者"
      actions={
        <>
          <Button kind="ghost" size="md" hasIconOnly renderIcon={Search} iconDescription="搜尋" />
          <Button kind="ghost" size="md" hasIconOnly renderIcon={Filter} iconDescription="篩選" />
          <Button kind="ghost" size="md" hasIconOnly renderIcon={DocumentExport} iconDescription="匯出 CSV" />
          <Button kind="primary" size="md" hasIconOnly renderIcon={Add} iconDescription="新增參賽者" />
        </>
      }
    />
  ),
};

export const ExamEditor: Story = {
  name: "Exam Editor Toolbar",
  render: () => (
    <PanelToolbar
      title="題目管理"
      actions={
        <>
          <Button kind="ghost" size="md" hasIconOnly renderIcon={Upload} iconDescription="匯入 JSON" />
          <Button kind="ghost" size="md" hasIconOnly renderIcon={DocumentExport} iconDescription="匯出" />
          <Button kind="ghost" size="md" hasIconOnly renderIcon={View} iconDescription="預覽" />
          <Button kind="primary" size="md" hasIconOnly renderIcon={Add} iconDescription="新增題目" />
        </>
      }
    />
  ),
};

export const WithStatus: Story = {
  name: "With Status Message",
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
          <Button kind="ghost" size="md" hasIconOnly renderIcon={Upload} iconDescription="匯入 JSON" />
          <Button kind="ghost" size="md" hasIconOnly renderIcon={DocumentExport} iconDescription="匯出" disabled />
          <Button kind="primary" size="md" hasIconOnly renderIcon={Add} iconDescription="新增題目" disabled />
        </>
      }
    />
  ),
};

export const TitleOnly: Story = {
  name: "Title Only (No Actions)",
  render: () => <PanelToolbar title="作答列表" />,
};
