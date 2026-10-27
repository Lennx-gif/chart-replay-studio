import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const rootDir = import.meta.dirname || process.cwd();

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(rootDir, "./src"),
      },
    },
    build: {
      target: "es2022",
      cssCodeSplit: true,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          chunkFileNames: "assets/js/[name]-[hash].js",
          entryFileNames: "assets/js/[name]-[hash].js",
          assetFileNames: (assetInfo) => {
            const fileName = assetInfo.name || "";
            if (fileName.endsWith(".css")) {
              return "assets/css/[name]-[hash][extname]";
            }
            if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(fileName)) {
              return "assets/media/[name]-[hash][extname]";
            }
            if (/\.(woff2?|eot|ttf|otf)$/i.test(fileName)) {
              return "assets/fonts/[name]-[hash][extname]";
            }
            return "assets/[name]-[hash][extname]";
          },
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (id.includes("lightweight-charts")) {
                return "vendor-charts";
              }
              if (id.includes("recharts") || id.includes("d3-") || id.includes("victory-vendor")) {
                return "vendor-analytics";
              }
              if (id.includes("react") || id.includes("react-dom") || id.includes("react-router-dom")) {
                return "vendor-react";
              }
              if (
                id.includes("@radix-ui") ||
                id.includes("lucide-react") ||
                id.includes("class-variance-authority") ||
                id.includes("clsx") ||
                id.includes("tailwind-merge")
              ) {
                return "vendor-ui";
              }
              if (id.includes("dexie") || id.includes("papaparse") || id.includes("@tanstack")) {
                return "vendor-storage";
              }
            }
          },
        },
      },
    },
  };
});
