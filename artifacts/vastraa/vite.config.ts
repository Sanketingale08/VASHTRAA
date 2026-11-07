import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// Filesystem resilience patch for Windows / OneDrive symlink traversal
function patchFsMethod(obj: any, name: string) {
  const orig = obj[name];
  if (!orig || orig.__isPatched) return;
  const wrapped = function (this: any, ...args: any[]) {
    try {
      return orig.apply(this, args);
    } catch (e: any) {
      if (e && (e.code === "EPERM" || e.code === "EACCES")) {
        if (name.includes("lstat")) {
          try { return fs.statSync.apply(fs, args as any); } catch (_) {}
        }
        return args[0];
      }
      throw e;
    }
  };
  wrapped.__isPatched = true;
  obj[name] = wrapped;
}
patchFsMethod(fs, "realpathSync");
patchFsMethod(fs, "lstatSync");


export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, path.resolve(import.meta.dirname, "../.."), "");
  const apiPort = Number(env.API_PORT || env.API_SERVER_PORT || process.env.API_PORT || process.env.API_SERVER_PORT || "5000");
  const rawPort = env.VITE_PORT || env.FRONTEND_PORT || (env.PORT && Number(env.PORT) !== apiPort ? env.PORT : process.env.VITE_PORT || "3000");
  let port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0 || port === apiPort) {
    port = 3000;
  }

  const basePath = env.BASE_PATH || process.env.BASE_PATH || "/";
  const apiTarget = `http://127.0.0.1:${apiPort}`;

  return {
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
  envDir: path.resolve(import.meta.dirname, "../.."),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            // Group core runtime and auth libraries into vendor-core to prevent circular chunk dependencies
            if (
              id.includes("react/") ||
              id.includes("react-dom/") ||
              id.includes("wouter") ||
              id.includes("@tanstack") ||
              id.includes("@clerk")
            ) {
              return "vendor-core";
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
      strict: false,
    },
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
      "/storage": {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
      "/socket.io": {
        target: apiTarget,
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
  };
});

