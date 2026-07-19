import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname, "examples/copilot-minimal"),
  plugins: [react()],
  resolve: {
    alias: {
      "@copilot-testing": resolve(__dirname, "src/shared/copilot/testing/index.ts"),
      "@copilot": resolve(__dirname, "src/shared/copilot/index.ts"),
      "@": resolve(__dirname, "src"),
    },
  },
  build: { outDir: resolve(__dirname, "dist-copilot-example"), emptyOutDir: true },
});
