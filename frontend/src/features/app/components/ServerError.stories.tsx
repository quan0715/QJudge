import type { Meta, StoryObj } from "@storybook/react-vite";
import { ServerError } from "./ServerError";

const meta: Meta<typeof ServerError> = {
    title: "shared/ui/app/ServerError",
    component: ServerError,
    
    args: {
      statusCode: 503,
      message: "服務暫時無法使用",
      theme: "white",
      timestamp: new Date().toISOString(),
    },
    argTypes: {
      statusCode: { control: "number", description: "狀態碼" },
      message: { control: "text", description: "訊息" },
      theme: { control: "select", options: ["white", "g10", "g90", "g100"], description: "Theme" },
      timestamp: { control: "text", description: "時間戳" },
    },
  
  parameters: {
    docs: { description: { component: '5xx Server Error 通用版：顯示狀態碼與重試/返回首頁動作。' } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      source: { code: `<ServerError statusCode={503} message="服務暫時無法使用" onRetry={...} onHome={...} />` },
    },
  },
  render: (args) => <ServerError {...args} />,
};

export const DarkTheme: Story = {
  parameters: {
    docs: {
      source: { code: `<ServerError statusCode={500} theme="g100" />` },
    },
  },
  render: () => (
        <ServerError
          statusCode={500}
          message="Internal Server Error"
          theme="g100"
          timestamp={new Date().toISOString()}
        />
      ),
};
