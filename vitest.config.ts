import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const rootDir = import.meta.dirname || process.cwd();

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    pool: "forks",
    isolate: false,
  },
  resolve: {
    alias: { "@": path.resolve(rootDir, "./src") },
  },
});
