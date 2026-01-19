import type { StoryModule } from "@/shared/types/story.types";
import { ServerError, type ServerErrorProps } from "./ServerError";

const storyModule: StoryModule<ServerErrorProps> = {
  meta: {
    title: "shared/ui/app/ServerError",
    component: ServerError,
    category: "shared",
    description: "5xx Server Error 通用版：顯示狀態碼與重試/返回首頁動作。",
    defaultArgs: {
      statusCode: 503,
      message: "服務暫時無法使用",
      theme: "white",
      timestamp: new Date().toISOString(),
    },
    argTypes: {
      statusCode: { control: "number", label: "狀態碼" },
      message: { control: "text", label: "訊息" },
      theme: { control: "select", options: ["white", "g10", "g90", "g100"], label: "Theme" },
      timestamp: { control: "text", label: "時間戳" },
    },
  },
  stories: [
    {
      name: "Default",
      render: (args) => <ServerError {...args} />,
      code: `<ServerError statusCode={503} message="服務暫時無法使用" onRetry={...} onHome={...} />`,
    },
    {
      name: "Dark Theme",
      render: () => (
        <ServerError
          statusCode={500}
          message="Internal Server Error"
          theme="g100"
          timestamp={new Date().toISOString()}
        />
      ),
      code: `<ServerError statusCode={500} theme="g100" />`,
    },
  ],
};

export default storyModule;
