import { execSync } from "node:child_process";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/** The build's short commit hash: FOURECB_COMMIT (Docker builds have no
 *  .git), else git's, marked "-dirty" for uncommitted changes. */
function buildCommit(): string {
  if (process.env.FOURECB_COMMIT) return process.env.FOURECB_COMMIT;
  try {
    return execSync("git describe --always --dirty --abbrev=7", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildCommit()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    {
      name: "development-style-csp",
      apply: "serve",
      transformIndexHtml(html) {
        return html.replace(
          "style-src 'self';",
          "style-src 'self' 'unsafe-inline';",
        );
      },
    },
    react(),
    VitePWA({
      injectRegister: "auto",
      registerType: "prompt",
      manifest: {
        name: "4E Character Builder",
        short_name: "4E Builder",
        description: "Offline-first D&D 4E character builder",
        theme_color: "#f4f1e8",
        background_color: "#f4f1e8",
        display: "standalone",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        // Routing lives in the hash, so "/" is the app's only document URL. Serve
        // the cached app for that alone; any other path (e.g. a hosting proxy's
        // /enter/<invite> link, which sets a cookie and redirects to "/") must reach
        // the server, or the app would boot at that path and keep it in the URL.
        navigateFallbackAllowlist: [/^\/$/],
        globPatterns: ["**/*.{css,html,js,json,svg,woff2}"],
        globIgnores: ["runtime-config.json"],
        runtimeCaching: [
          {
            urlPattern: /\/runtime-config\.json$/,
            handler: "NetworkOnly",
            method: "GET",
          },
        ],
      },
    }),
  ],
  worker: {
    format: "es",
  },
});
