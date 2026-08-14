import path from "path";
import type { StorybookConfig } from "@storybook/react-vite";
import type { IncomingMessage, ServerResponse } from "http";
import type { PluginOption } from "vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
  viteFinal: async (config) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, string>),
      "@copilot/testing": path.resolve(__dirname, "../src/shared/copilot/testing/index.ts"),
      "@copilot": path.resolve(__dirname, "../src/shared/copilot/index.ts"),
      "@": path.resolve(__dirname, "../src"),
      "~": path.resolve(__dirname, "../node_modules"),
    };

    config.server ??= {};
    config.server.allowedHosts = true;

    // Storybook auto-merges the project's vite.config.ts, which includes
    // proxy plugins meant only for the frontend dev server. Remove them
    // to prevent self-proxying loops inside the Storybook container.
    delete config.server.proxy;
    const frontendPluginNames = [
      'storybook-trailing-slash-redirect',
      'storybook-absolute-paths-proxy',
    ];
    if (Array.isArray(config.plugins)) {
      config.plugins = (config.plugins as PluginOption[]).filter((p) => {
        if (p && typeof p === 'object' && 'name' in p) {
          return !frontendPluginNames.includes((p as any).name);
        }
        return true;
      });
    }

    // Rewrite clean virtual module URLs to Vite's internal __x00__ format.
    // Cloudflare Tunnel blocks URLs containing __x00__ (null byte encoding),
    // so the frontend proxy rewrites them to /_sb_vmod/ paths instead.
    (config.plugins as any[]).push({
      name: 'storybook-clean-virtual-urls',
      configureServer(server: any) {
        server.middlewares.use((req: IncomingMessage, _res: ServerResponse, next: () => void) => {
          if (req.url?.startsWith('/_sb_vmod/')) {
            req.url = req.url.replace('/_sb_vmod/', '/@id/\0virtual:/@storybook/');
          }
          next();
        });
      },
    });

    return config;
  },
};

export default config;
