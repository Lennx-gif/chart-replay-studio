import { defineConfig } from "vitest/config";
import path from "path";

const rootDir = import.meta.dirname || process.cwd();

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
    pool: "threads",
    fileParallelism: false,
    isolate: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: { "@": path.resolve(rootDir, "./src") },
  },
});
