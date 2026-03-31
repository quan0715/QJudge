import type { Preview } from "@storybook/react";

// Import the same global styles used by the app
import "../src/styles/globals.scss";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "carbon-dark",
      values: [
        { name: "carbon-dark", value: "#161616" },   // Carbon Gray 100
        { name: "carbon-light", value: "#f4f4f4" },  // Carbon Gray 10
        { name: "carbon-white", value: "#ffffff" },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: {
      toc: true,
    },
  },
};

export default preview;
