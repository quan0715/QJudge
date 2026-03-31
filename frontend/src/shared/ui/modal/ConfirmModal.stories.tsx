import { useState } from "react";
import { Button } from "@carbon/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfirmModal, type ConfirmModalProps } from "./ConfirmModal";

/** Interactive demo with useState hook */
const ConfirmModalDemo = ({
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger,
}: Omit<ConfirmModalProps, "open" | "onConfirm" | "onCancel">) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button kind={danger ? "danger" : "primary"} onClick={() => setOpen(true)}>
        開啟確認對話框
      </Button>
      <ConfirmModal
        open={open}
        title={title}
        body={body}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        danger={danger}
        onConfirm={() => {
          setOpen(false);
          console.log("Confirmed!");
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
};

const meta: Meta<typeof ConfirmModal> = {
    title: "shared/ui/modal/ConfirmModal",
    component: ConfirmModal,
    
    args: {
      title: "刪除確認",
      body: "是否確認刪除這筆資料？此動作無法復原。",
      confirmLabel: "確認",
      cancelLabel: "取消",
      danger: true,
    },
    argTypes: {
      title: { control: "text", description: "對話框標題" },
      body: { control: "text", description: "對話框內容" },
      confirmLabel: { control: "text", description: "確認按鈕文字" },
      cancelLabel: { control: "text", description: "取消按鈕文字" },
      danger: { control: "boolean", description: "危險模式（紅色）" },
    },
  
  parameters: {
    docs: { description: { component: '通用確認對話框。使用 useState 控制開關狀態。' } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    docs: {
      description: { story: '點擊按鈕開啟對話框，展示 useState hook 的使用方式。' },
      source: { code: `const [open, setOpen] = useState(false);

<Button onClick={() => setOpen(true)}>開啟</Button>
<ConfirmModal
  open={open}
  title="刪除確認"
  body="確定要刪除？"
  danger
  onConfirm={() => { setOpen(false); /* do something */ }}
  onCancel={() => setOpen(false)}
/>` },
    },
  },
  render: (args) => (
        <ConfirmModalDemo
          title={args.title as string}
          body={args.body as string}
          confirmLabel={args.confirmLabel as string}
          cancelLabel={args.cancelLabel as string}
          danger={args.danger as boolean}
        />
      ),
};

export const AllVariants: Story = {
  parameters: {
    docs: {
      description: { story: '展示不同類型的確認對話框。' },
    },
  },
  render: () => {
        const DemoRow = ({
          label,
          ...props
        }: { label: string } & Omit<ConfirmModalProps, "open" | "onConfirm" | "onCancel">) => {
          const [open, setOpen] = useState(false);
          return (
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
              <span style={{ width: "120px", color: "var(--cds-text-secondary)" }}>{label}</span>
              <Button size="sm" kind={props.danger ? "danger" : "primary"} onClick={() => setOpen(true)}>
                開啟
              </Button>
              <ConfirmModal
                open={open}
                {...props}
                onConfirm={() => setOpen(false)}
                onCancel={() => setOpen(false)}
              />
            </div>
          );
        };

        return (
          <div>
            <DemoRow label="危險操作" title="刪除確認" body="確定要刪除這筆資料？" danger />
            <DemoRow label="一般確認" title="確認送出" body="確定要送出表單？" />
            <DemoRow label="自訂按鈕" title="登出確認" body="確定要登出？" confirmLabel="登出" cancelLabel="留在這裡" />
          </div>
        );
      },
};
