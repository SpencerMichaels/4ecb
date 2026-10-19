import { useEffect, useState } from "react";

import {
  PERSISTENCE_BANNER_DISMISSED_KEY,
  readPersistenceStatus,
  requestPersistentStorage,
} from "./browser-persistence";
import { downloadCharacterBackup } from "./download";
import { Icon } from "./Icon";

function dismissedBefore(): boolean {
  try {
    return localStorage.getItem(PERSISTENCE_BANNER_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * A standing, actionable state present on arrival: the browser may clear the
 * characters saved in it. Asks it to keep them; if it refuses, suggests
 * backups instead. Dismissing hides it for good (Settings keeps the request).
 */
export function PersistenceBanner({
  onFailure,
}: {
  readonly onFailure: (reason: unknown, title: string) => void;
}) {
  const [phase, setPhase] = useState<"hidden" | "ask" | "refused">("hidden");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (dismissedBefore()) return;
    let cancelled = false;
    void readPersistenceStatus()
      .then((status) => {
        if (!cancelled && status.supported && !status.persisted)
          setPhase("ask");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  if (phase === "hidden") return null;

  function dismiss(): void {
    setPhase("hidden");
    try {
      localStorage.setItem(PERSISTENCE_BANNER_DISMISSED_KEY, "1");
    } catch {
      // Hidden for this visit only.
    }
  }

  async function ask(): Promise<void> {
    setBusy(true);
    try {
      setPhase((await requestPersistentStorage()) ? "hidden" : "refused");
    } finally {
      setBusy(false);
    }
  }

  const refused = phase === "refused";
  return (
    <section
      aria-label="Saved data"
      className={`persistence-banner${refused ? " is-refused" : ""}`}
      role={refused ? "status" : undefined}
    >
      <Icon name={refused ? "warning" : "shield"} />
      <p>
        {refused ? (
          <>
            <strong>Your browser won&apos;t promise to keep them.</strong> Back
            up your characters now and then so you can restore them if
            they&apos;re cleared.
          </>
        ) : (
          <>
            <strong>Your characters are saved in this browser.</strong> Browsers
            can clear saved site data to free up space, which would delete them.
            Ask the browser to keep them.
          </>
        )}
      </p>
      {refused ? (
        <button
          type="button"
          onClick={() =>
            void downloadCharacterBackup().catch((reason: unknown) =>
              onFailure(reason, "Couldn't back up your characters"),
            )
          }
        >
          Back up characters
        </button>
      ) : (
        <button
          type="button"
          className="button-primary"
          disabled={busy}
          onClick={() =>
            void ask().catch((reason: unknown) =>
              onFailure(reason, "Couldn't ask the browser"),
            )
          }
        >
          Keep my characters
        </button>
      )}
      <button
        aria-label="Dismiss"
        className="icon-only-button button-icon"
        title="Dismiss"
        type="button"
        onClick={dismiss}
      >
        <Icon name="remove" />
      </button>
    </section>
  );
}
