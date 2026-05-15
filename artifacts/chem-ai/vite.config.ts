import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// The API server uses PORT.  Keep the frontend on its own port locally so
// `pnpm --filter @workspace/api-server run dev` and this Vite server can run
// at the same time.
const isBuild = process.env.VITE_COMMAND === "build" ||
  process.argv.includes("build");

const rawPort = process.env.FRONTEND_PORT ?? process.env.VITE_PORT ?? process.env.PORT;
let port = 5173; // safe default for build mode

if (!isBuild) {
  if (rawPort) {
    const parsed = Number(rawPort);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new Error(`Invalid frontend port value: "${rawPort}"`);
    }
    port = parsed;
  }
} else if (rawPort) {
  port = Number(rawPort) || 5173;
}

const basePath = process.env.BASE_PATH ?? "/";
const apiTarget = process.env.VITE_API_TARGET ?? "http://localhost:8080";
const chemeBrainReadinessAuthority =
  process.env.VITE_CHEME_BRAIN_READINESS_AUTHORITY ??
  process.env.CHEME_BRAIN_READINESS_AUTHORITY ??
  (process.env.NODE_ENV === "production" ? "false" : "true");

export default defineConfig({
  base: basePath,
  define: {
    "import.meta.env.VITE_CHEME_BRAIN_READINESS_AUTHORITY": JSON.stringify(chemeBrainReadinessAuthority),
  },
  plugins: [
    react(),
    tailwindcss(),
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
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
