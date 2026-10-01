import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
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
        globPatterns: ["**/*.{css,html,js,json,svg}"],
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
