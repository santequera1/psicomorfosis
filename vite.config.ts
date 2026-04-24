// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const BACKEND = "http://127.0.0.1:3002";

// Por defecto el build apunta a Cloudflare Workers (flujo Lovable).
// Con DEPLOY_TARGET=node el build produce un bundle ejecutable con Node
// (usado por el deploy en VPS detrás de nginx; ver server.mjs).
const deployTarget = process.env.DEPLOY_TARGET ?? "cloudflare";

export default defineConfig({
  cloudflare: deployTarget === "node" ? false : undefined,
  vite: {
    server: {
      allowedHosts: ["psico.wailus.co"],
      proxy: {
        "/api": { target: BACKEND, changeOrigin: true },
        "/socket.io": { target: BACKEND, changeOrigin: true, ws: true },
      },
    },
  },
});
