/** Whether the browser has promised not to clear this site's saved data. */
export interface PersistenceStatus {
  /** The browser can be asked (navigator.storage.persist exists). */
  readonly supported: boolean;
  readonly persisted: boolean;
}

export const PERSISTENCE_BANNER_DISMISSED_KEY =
  "4ecb.persistenceBannerDismissed.v1";

export async function readPersistenceStatus(): Promise<PersistenceStatus> {
  const storage =
    typeof navigator === "undefined" ? undefined : navigator.storage;
  const supported =
    typeof storage?.persist === "function" &&
    typeof storage.persisted === "function";
  if (!supported) return { supported: false, persisted: false };
  return { supported, persisted: await storage.persisted() };
}

/** Asks the browser to keep this site's data; resolves to whether it will. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator.storage?.persist !== "function") return false;
  return navigator.storage.persist();
}
