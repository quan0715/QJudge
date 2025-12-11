import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
<<<<<<< HEAD
import path from "path";
=======
>>>>>>> fc2d00fd491dc0eeb21c8253c6362d4ce466f2ce

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
<<<<<<< HEAD
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "src/test/"],
=======
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/test/",
        "**/*.d.ts",
        "**/*.config.*",
        "dist/",
      ],
>>>>>>> fc2d00fd491dc0eeb21c8253c6362d4ce466f2ce
    },
  },
  resolve: {
    alias: {
<<<<<<< HEAD
      "@": path.resolve(__dirname, "./src"),
=======
      "@": "/src",
>>>>>>> fc2d00fd491dc0eeb21c8253c6362d4ce466f2ce
    },
  },
});
