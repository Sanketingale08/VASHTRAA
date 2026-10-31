import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT || "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react/") || id.includes("react-dom/") || id.includes("wouter") || id.includes("@tanstack")) {
              return "vendor-core";
            }
            if (id.includes("@clerk")) {
              return "vendor-auth";
            }
            if (id.includes("recharts") || id.includes("d3-")) {
              return "vendor-charts";
            }
            if (id.includes("jspdf") || id.includes("xlsx") || id.includes("html2canvas") || id.includes("canvg")) {
              return "vendor-documents";
            }
            if (id.includes("lucide-react") || id.includes("@radix-ui") || id.includes("framer-motion")) {
              return "vendor-ui";
            }
            if (id.includes("@uppy")) {
              return "vendor-upload";
            }
          }
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.API_PORT || process.env.API_SERVER_PORT || "3001"}`,
        changeOrigin: true,
        secure: false,
      },
      "/storage": {
        target: `http://localhost:${process.env.API_PORT || process.env.API_SERVER_PORT || "3001"}`,
        changeOrigin: true,
        secure: false,
      },
      "/socket.io": {
        target: `http://localhost:${process.env.API_PORT || process.env.API_SERVER_PORT || "3001"}`,
        changeOrigin: true,
        ws: true,
      },
    },
    hmr: {
      overlay: false,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
