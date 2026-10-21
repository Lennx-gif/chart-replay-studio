import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  plugins: [],
  css: {
    postcss: {
      plugins: [],
    },
  },
  test: {
    environment: "node",
    css: false,
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
