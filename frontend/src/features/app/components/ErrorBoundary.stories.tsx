import React from "react";
import type { StoryModule } from "@/shared/types/story.types";
import ErrorBoundary, { type ErrorBoundaryProps } from "./ErrorBoundary";

const storyModule: StoryModule<ErrorBoundaryProps> = {
  meta: {
    title: "shared/ui/app/ErrorBoundary",
    component: ErrorBoundary as React.ComponentType<ErrorBoundaryProps>,
    category: "shared",
    description: "Error Boundary 基本示例，展示預設 fallback。",
    defaultArgs: {},
  },
  stories: [
    {
      name: "Default",
      render: () => (
        <ErrorBoundary>
          <div>內容</div>
        </ErrorBoundary>
      ),
    },
  ],
};

export default storyModule;
