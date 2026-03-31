import type { Meta, StoryObj } from "@storybook/react";
import { NotFound } from "./NotFound";

const meta: Meta<typeof NotFound> = {
    title: "shared/ui/app/NotFound",
    component: NotFound,
    
    args: {
      title: "頁面不存在",
      description: "您要找的頁面可能已被移除、名稱已更改，或是暫時無法使用。",
      theme: "white",
    },
    argTypes: {
      title: { control: "text", description: "標題" },
      description: { control: "text", description: "描述" },
      theme: { control: "select", options: ["white", "g10", "g90", "g100"], description: "Theme" },
      homeLabel: { control: "text", description: "首頁按鈕文字" },
      backLabel: { control: "text", description: "返回按鈕文字" },
    },
  
  parameters: {
    docs: { description: { component: '404 Not Found 通用版：可注入返回首頁/上一頁行為。' } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      source: { code: `<NotFound theme="white" onHome={...} onBack={...} />` },
    },
  },
  render: (args) => <NotFound {...args} />,
};

export const DarkTheme: Story = {
  parameters: {
    docs: {
      source: { code: `<NotFound theme="g100" title="Page not found" />` },
    },
  },
  render: () => <NotFound theme="g100" title="Page not found" homeLabel="Home" backLabel="Back" />,
};
