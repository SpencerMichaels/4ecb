// Background garbage collection of composed profile packs and superseded
// campaign revisions (browser-storage `collectUnusedContent`). Called after
// load and after content or campaign changes; it never blocks the UI and
// its failures are quiet (it runs again on the next change or load).

import { collectUnusedContent } from "@4ecb/browser-storage";

const DELAY_MS = 2000;

let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let again = false;

async function run(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      try {
        await collectUnusedContent();
      } catch (reason: unknown) {
        console.warn("Content cleanup skipped:", reason);
      }
    } while (again);
  } finally {
    running = false;
  }
}

/** Schedules one collection a moment from now (repeated calls coalesce). */
export function scheduleContentCollection(): void {
  if (typeof indexedDB === "undefined") return;
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void run();
  }, DELAY_MS);
}
