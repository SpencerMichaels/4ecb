import { useCallback, useEffect, useMemo, useState } from "react";

import { ContentPackRepository } from "@4ecb/browser-storage";
import type { ContentPackManifest } from "@4ecb/content-pack";

import { CompendiumPage } from "./CompendiumPage";
import { CharacterLibraryPage } from "./CharacterLibraryPage";
import { CharacterEditorPage } from "./CharacterEditorPage";
import { CharacterSheetPage } from "./CharacterSheetPage";
import { parseHashRoute } from "./routes";
import { PwaStatus } from "./PwaStatus";
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
          <p className="eyebrow">Builder beta · MVP closure in progress</p>
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
        <a
          aria-current={route.page === "characters" ? "page" : undefined}
          href="#/characters"
        >
          Characters
        </a>
        <a
          aria-current={route.page === "settings" ? "page" : undefined}
          href="#/settings"
        >
          Content settings
        </a>
      </nav>

      <PwaStatus />

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
      ) : route.page === "characters" ? (
        route.characterId === undefined ? (
          <CharacterLibraryPage
            manifests={manifests}
            {...(activePackId === undefined ? {} : { activePackId })}
          />
        ) : route.mode === "edit" ? (
          <CharacterEditorPage characterId={route.characterId} />
        ) : (
          <CharacterSheetPage
            characterId={route.characterId}
            manifests={manifests}
          />
        )
      ) : (
        <CompendiumPage
          {...(activePackId === undefined ? {} : { activePackId })}
          query={route.query}
          {...(route.entityId === undefined
            ? {}
            : { entityId: route.entityId })}
        />
      )}
      <footer className="public-notice">
        <strong>Unofficial, local-first software.</strong> This project is not
        affiliated with or endorsed by Wizards of the Coast. Public builds do
        not include the official rules corpus; imported packs and characters
        remain in this browser unless you explicitly export them.
      </footer>
    </div>
  );
}
