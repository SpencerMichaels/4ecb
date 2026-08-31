import { useCallback, useEffect, useMemo, useState } from "react";

import { ContentPackRepository } from "@4ecb/browser-storage";
import type { ContentPackManifest } from "@4ecb/content-pack";

import { CompendiumPage } from "./CompendiumPage";
import { parseHashRoute } from "./routes";
import { SettingsPage } from "./SettingsPage";

const repository = new ContentPackRepository();

export function App() {
  const [hash, setHash] = useState(() => window.location.hash);
  const [manifests, setManifests] = useState<ContentPackManifest[]>([]);
  const [activePackId, setActivePackId] = useState<string>();
  const [storageReady, setStorageReady] = useState(false);
  const [error, setError] = useState<string>();
  const route = useMemo(() => parseHashRoute(hash), [hash]);

  const refresh = useCallback(async () => {
    const [installed, active] = await Promise.all([
      repository.list(),
      repository.activePackId(),
    ]);
    setManifests(installed);
    setActivePackId(active);
    setStorageReady(true);
  }, []);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    void refresh().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStorageReady(true);
    });
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [refresh]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="app-header">
        <div>
          <p className="eyebrow">Compendium alpha</p>
          <h1>4E Character Builder</h1>
        </div>
        <p className="unofficial">
          Unofficial fan project. Bring your own legally obtained data.
        </p>
      </header>

      <nav className="primary-nav" aria-label="Primary navigation">
        <a
          aria-current={route.page === "compendium" ? "page" : undefined}
          href="#/compendium"
        >
          Compendium
        </a>
        <span aria-disabled="true">Characters</span>
        <a
          aria-current={route.page === "settings" ? "page" : undefined}
          href="#/settings"
        >
          Content settings
        </a>
      </nav>

      {error === undefined ? null : (
        <div className="global-error error" role="alert">
          <strong>Storage problem</strong>
          <span>{error}</span>
        </div>
      )}

      {!storageReady ? (
        <main className="loading-state" id="main-content">
          Loading local content profiles…
        </main>
      ) : route.page === "settings" ? (
        <SettingsPage
          manifests={manifests}
          {...(activePackId === undefined ? {} : { activePackId })}
          onChanged={refresh}
        />
      ) : (
        <CompendiumPage
          {...(activePackId === undefined ? {} : { activePackId })}
          query={route.query}
          {...(route.entityId === undefined
            ? {}
            : { entityId: route.entityId })}
        />
      )}
    </div>
  );
}
