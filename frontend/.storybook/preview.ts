import type { Preview } from "@storybook/react-vite";

// Import the same global styles used by the app
import "../src/styles/globals.scss";

const preview: Preview = {
  parameters: {
    backgrounds: {
      options: {
        "carbon-dark": // Carbon Gray 100
        { name: "carbon-dark", value: "#161616" },

        "carbon-light": // Carbon Gray 10
        { name: "carbon-light", value: "#f4f4f4" },

        "carbon-white": { name: "carbon-white", value: "#ffffff" }
      }
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

  initialGlobals: {
    backgrounds: {
      value: "carbon-dark"
    }
  }
};

export default preview;
