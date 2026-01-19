import type { StoryModule } from "@/shared/types/story.types";
import { NotFound, type NotFoundProps } from "./NotFound";

const storyModule: StoryModule<NotFoundProps> = {
  meta: {
    title: "shared/ui/app/NotFound",
    component: NotFound,
    category: "shared",
    description: "404 Not Found 通用版：可注入返回首頁/上一頁行為。",
    defaultArgs: {
      title: "頁面不存在",
      description: "您要找的頁面可能已被移除、名稱已更改，或是暫時無法使用。",
      theme: "white",
    },
    argTypes: {
      title: { control: "text", label: "標題" },
      description: { control: "text", label: "描述" },
      theme: { control: "select", options: ["white", "g10", "g90", "g100"], label: "Theme" },
      homeLabel: { control: "text", label: "首頁按鈕文字" },
      backLabel: { control: "text", label: "返回按鈕文字" },
    },
  },
  stories: [
    {
      name: "Default",
      render: (args) => <NotFound {...args} />,
      code: `<NotFound theme="white" onHome={...} onBack={...} />`,
    },
    {
      name: "Dark Theme",
      render: () => <NotFound theme="g100" title="Page not found" homeLabel="Home" backLabel="Back" />,
      code: `<NotFound theme="g100" title="Page not found" />`,
    },
  ],
};

export default storyModule;
