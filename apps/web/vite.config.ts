import { execSync } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// A relative import, so Vite bundles the TypeScript source into the loaded
// config (a workspace package import would be left to Node to load).
import { handleShareRequest, ShareStore } from "../share-relay/src/index";
import { deployFileForRequest } from "./src/dev-deploy-path";
import { themeBackgrounds } from "./src/theme-tokens";
import { WEB_MANIFEST, WEB_MANIFEST_FILENAME } from "./src/web-manifest";

/** Page backgrounds from the theme definitions, the one source for the
 *  browser/installed-app chrome colors (theme.ts keeps them in sync at run
 *  time; the manifest has none, see web-manifest.ts). */
const backgrounds = themeBackgrounds(
  readFileSync(join(import.meta.dirname, "src/styles/01-base.css"), "utf8"),
);

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

/** The ignored operator deploy/ directory (`content-tool advertise`,
 *  `scripts/publish-content.sh --no-push`), served in development the way the
 *  image serves it, so a locally published pack or hosted campaign
 *  (`private-packs/campaigns/`) reaches the dev server. Without
 *  deploy/, runtime-config.json falls through to public/. */
function developmentDeployDirectory(): Plugin {
  const deploy = join(import.meta.dirname, "../../deploy");
  return {
    name: "development-deploy-directory",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? "").split(/[?#]/, 1)[0] ?? "";
        const file = deployFileForRequest(deploy, path);
        if (file === undefined) return next();
        if (
          file === "reject" ||
          !existsSync(file) ||
          !statSync(file).isFile()
        ) {
          // A missing pack or campaign must not fall back to the app's HTML
          // document.
          if (path.startsWith("/private-packs/")) {
            response.statusCode = 404;
            response.end();
            return;
          }
          return next();
        }
        response.setHeader(
          "Content-Type",
          file.endsWith(".json")
            ? "application/json"
            : "application/octet-stream",
        );
        response.setHeader("Cache-Control", "no-store");
        createReadStream(file).pipe(response);
      });
    },
  };
}

/** Character sharing's relay (apps/share-relay) on the dev server at
 *  /api/share, the path the image's nginx proxies to it, so `pnpm dev`
 *  shares work without a separate process. Whether the app offers sharing
 *  is still runtime-config.json's features.characterShare. */
function developmentShareRelay(): Plugin {
  return {
    name: "development-share-relay",
    apply: "serve",
    configureServer(server) {
      const store = new ShareStore();
      server.middlewares.use((request, response, next) => {
        if (!handleShareRequest(store, request, response)) next();
      });
    },
  };
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
    {
      // The first paint's title/status bar, before the app's own theme
      // setting runs (theme.ts syncThemeColor takes over from there).
      name: "theme-color-meta",
      transformIndexHtml: () =>
        (["light", "dark"] as const).map((scheme) => ({
          tag: "meta",
          attrs: {
            name: "theme-color",
            media: `(prefers-color-scheme: ${scheme})`,
            content: backgrounds[scheme],
          },
          injectTo: "head" as const,
        })),
    },
    {
      // The installed app's manifest (web-manifest.ts). vite-plugin-pwa's own
      // manifest option fills a missing theme_color/background_color with its
      // defaults, and this one must have neither.
      name: "web-manifest",
      apply: "build",
      transformIndexHtml: () => [
        {
          tag: "link",
          attrs: { rel: "manifest", href: `/${WEB_MANIFEST_FILENAME}` },
          injectTo: "head" as const,
        },
      ],
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: WEB_MANIFEST_FILENAME,
          source: JSON.stringify(WEB_MANIFEST),
        });
      },
    },
    developmentDeployDirectory(),
    developmentShareRelay(),
    react(),
    VitePWA({
      injectRegister: "auto",
      registerType: "prompt",
      // The "web-manifest" plugin above emits the manifest; globPatterns
      // precaches it with public/icons/ and icon.svg.
      manifest: false,
      workbox: {
        // Routing lives in the hash, so "/" is the app's only document URL. Serve
        // the cached app for that alone; any other path (e.g. a hosting proxy's
        // /enter/<invite> link, which sets a cookie and redirects to "/") must reach
        // the server, or the app would boot at that path and keep it in the URL.
        navigateFallbackAllowlist: [/^\/$/],
        globPatterns: ["**/*.{css,html,js,json,png,svg,webmanifest,woff2}"],
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
