// Injected by vite.config.ts at build (or dev-server start) time.
declare const __BUILD_COMMIT__: string;
declare const __BUILD_DATE__: string;

/** Which build is running: its commit and when it was built. */
export const buildInfo = {
  commit: typeof __BUILD_COMMIT__ === "undefined" ? "dev" : __BUILD_COMMIT__,
  date: typeof __BUILD_DATE__ === "undefined" ? undefined : __BUILD_DATE__,
};
