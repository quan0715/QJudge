import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import ErrorBoundary, { type ErrorBoundaryProps } from "./ErrorBoundary";

const meta: Meta<typeof ErrorBoundary> = {
    title: "shared/ui/app/ErrorBoundary",
    component: ErrorBoundary as React.ComponentType<ErrorBoundaryProps>,
    
    args: {},
  
  parameters: {
    docs: { description: { component: 'Error Boundary 基本示例，展示預設 fallback。' } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
        <ErrorBoundary>
          <div>內容</div>
        </ErrorBoundary>
      ),
};
