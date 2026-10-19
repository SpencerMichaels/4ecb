import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import { Icon } from "./Icon";

interface PwaUpdate {
  /** A new version is installed and waiting for a reload. */
  readonly ready: boolean;
  /** Activates the waiting version and reloads; browser data is kept. */
  readonly apply: () => void;
}

const PwaUpdateContext = createContext<PwaUpdate>({
  ready: false,
  apply: () => undefined,
});

/** Registers the service worker once for the whole app. Offline readiness and
 *  connectivity are not announced (nothing for the user to do); only a waiting
 *  update is surfaced, as the top-bar UpdateButton. */
export function PwaUpdateProvider({ children }: { children: ReactNode }) {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });
  const value = useMemo(
    () => ({
      ready: needRefresh,
      apply: () => void updateServiceWorker(true),
    }),
    [needRefresh, updateServiceWorker],
  );
  return (
    <PwaUpdateContext.Provider value={value}>
      {children}
    </PwaUpdateContext.Provider>
  );
}

/** Top-bar icon shown only while an update is waiting; clicking it reloads
 *  into the new version. Sits to the left of the Settings gear. */
export function UpdateButton() {
  const { ready, apply } = useContext(PwaUpdateContext);
  return ready ? (
    <button
      aria-label="Update available, reload to update"
      className="icon-only-button button-icon update-ready"
      title="Update available. Click to reload; your characters are kept."
      type="button"
      onClick={apply}
    >
      <Icon name="circle-arrow-up" />
    </button>
  ) : null;
}
