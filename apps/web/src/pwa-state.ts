export interface PwaState {
  readonly needRefresh: boolean;
  readonly offlineReady: boolean;
  readonly online: boolean;
}

export type PwaMessage =
  "update-available" | "offline-ready" | "offline" | undefined;

export function pwaMessage(state: PwaState): PwaMessage {
  if (state.needRefresh) return "update-available";
  if (!state.online) return "offline";
  if (state.offlineReady) return "offline-ready";
  return undefined;
}
