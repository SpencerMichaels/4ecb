import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import { pwaMessage } from "./pwa-state";

interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{ readonly outcome: "accepted" | "dismissed" }>;
  prompt(): Promise<void>;
}

export function PwaStatus() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });
  const [online, setOnline] = useState(() => navigator.onLine);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent>();

  useEffect(() => {
    const becameOnline = () => setOnline(true);
    const becameOffline = () => setOnline(false);
    const canInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("online", becameOnline);
    window.addEventListener("offline", becameOffline);
    window.addEventListener("beforeinstallprompt", canInstall);
    return () => {
      window.removeEventListener("online", becameOnline);
      window.removeEventListener("offline", becameOffline);
      window.removeEventListener("beforeinstallprompt", canInstall);
    };
  }, []);

  const message = pwaMessage({ needRefresh, offlineReady, online });
  return message === undefined && installPrompt === undefined ? null : (
    <aside className="pwa-status" aria-label="Application status">
      {message === "update-available" ? (
        <>
          <p>
            <strong>Application update ready.</strong> Saved local data will be
            retained. Reload when you are ready to use the new application
            files.
          </p>
          <button type="button" onClick={() => void updateServiceWorker(true)}>
            Reload and update
          </button>
          <button type="button" onClick={() => setNeedRefresh(false)}>
            Later
          </button>
        </>
      ) : message === "offline" ? (
        <p>
          <strong>Offline.</strong> Installed application files and
          browser-local characters remain available.
        </p>
      ) : message === "offline-ready" ? (
        <>
          <p>
            <strong>Ready offline.</strong> The application shell has been saved
            for future offline use.
          </p>
          <button type="button" onClick={() => setOfflineReady(false)}>
            Dismiss
          </button>
        </>
      ) : null}
      {installPrompt === undefined ? null : (
        <button
          type="button"
          onClick={() => {
            void installPrompt.prompt().then(() => installPrompt.userChoice);
            setInstallPrompt(undefined);
          }}
        >
          Install application
        </button>
      )}
    </aside>
  );
}
