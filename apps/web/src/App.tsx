import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ContentPackRepository,
  type ContentProfileDefinition,
  type InstalledContentPack,
} from "@4ecb/browser-storage";

import { CompendiumPage } from "./CompendiumPage";
import { CharacterLibraryPage } from "./CharacterLibraryPage";
import { CharacterEditorPage } from "./CharacterEditorPage";
import { CharacterSheetPage } from "./CharacterSheetPage";
import { parseHashRoute } from "./routes";
import { focusMainContent } from "./route-focus";
import { PwaStatus } from "./PwaStatus";
import { SettingsPage } from "./SettingsPage";
import {
  downloadAdvertisedPack,
  parseRuntimeContentConfig,
  type AdvertisedContentPack,
} from "./runtime-content";

const repository = new ContentPackRepository();

export interface ContentDownloadState {
  readonly phase:
    "queued" | "downloading" | "installing" | "available" | "error";
  readonly receivedBytes?: number;
  readonly totalBytes?: number;
  readonly error?: string;
}

export function App() {
  const [hash, setHash] = useState(() => window.location.hash);
  const [installedPacks, setInstalledPacks] = useState<InstalledContentPack[]>(
    [],
  );
  const [activePackId, setActivePackId] = useState<string>();
  const [activeProfile, setActiveProfile] =
    useState<ContentProfileDefinition>();
  const [advertisedPacks, setAdvertisedPacks] = useState<
    readonly AdvertisedContentPack[]
  >([]);
  const [contentDownloads, setContentDownloads] = useState<
    Readonly<Record<string, ContentDownloadState>>
  >({});
  const [runtimeContentError, setRuntimeContentError] = useState<string>();
  const [storageReady, setStorageReady] = useState(false);
  const [error, setError] = useState<string>();
  const firstRoute = useRef(true);
  const runtimeContentStarted = useRef(false);
  const route = useMemo(() => parseHashRoute(hash), [hash]);

  const refresh = useCallback(async () => {
    const [installed, active, profile] = await Promise.all([
      repository.listInstalled(),
      repository.activePackId(),
      repository.activeProfile(),
    ]);
    setInstalledPacks(installed);
    setActivePackId(active);
    setActiveProfile(profile);
    setStorageReady(true);
  }, []);

  const installAdvertisedPack = useCallback(
    async (advertised: AdvertisedContentPack): Promise<void> => {
      setContentDownloads((current) => ({
        ...current,
        [advertised.packId]: { phase: "queued" },
      }));
      try {
        const current = await repository.listInstalled();
        const exact = current.find(
          ({ manifest }) =>
            manifest.packId === advertised.packId &&
            manifest.contentDigest === advertised.contentDigest,
        );
        if (exact?.origin !== "server") {
          const conflicting = current.find(
            ({ manifest }) =>
              manifest.packId === advertised.packId &&
              manifest.contentDigest !== advertised.contentDigest,
          );
          if (conflicting !== undefined)
            throw new Error(
              `Pack ID ${advertised.packId} is already installed with digest ${conflicting.manifest.contentDigest}. The administrator must publish a revision-qualified pack ID to preserve pinned characters.`,
            );
          const { bytes } = await downloadAdvertisedPack(
            advertised,
            (receivedBytes, totalBytes) =>
              setContentDownloads((downloads) => ({
                ...downloads,
                [advertised.packId]: {
                  phase: "downloading",
                  receivedBytes,
                  ...(totalBytes === undefined ? {} : { totalBytes }),
                },
              })),
          );
          setContentDownloads((downloads) => ({
            ...downloads,
            [advertised.packId]: { phase: "installing" },
          }));
          await repository.installEncoded(bytes, {
            origin: "server",
            advertised,
          });
        }
        setContentDownloads((downloads) => ({
          ...downloads,
          [advertised.packId]: { phase: "available" },
        }));
        await refresh();
      } catch (reason: unknown) {
        setContentDownloads((downloads) => ({
          ...downloads,
          [advertised.packId]: {
            phase: "error",
            error: reason instanceof Error ? reason.message : String(reason),
          },
        }));
      }
    },
    [refresh],
  );

  const loadRuntimeContent = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/runtime-config.json", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok)
        throw new Error(
          `Runtime configuration failed to load (${response.status})`,
        );
      const configured = parseRuntimeContentConfig(await response.json());
      setAdvertisedPacks(configured.contentPacks);
      setRuntimeContentError(undefined);
      for (const advertised of configured.contentPacks)
        await installAdvertisedPack(advertised);
    } catch (reason: unknown) {
      setRuntimeContentError(
        reason instanceof Error ? reason.message : String(reason),
      );
    }
  }, [installAdvertisedPack]);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    void refresh().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStorageReady(true);
    });
    if (!runtimeContentStarted.current) {
      runtimeContentStarted.current = true;
      void loadRuntimeContent();
    }
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [loadRuntimeContent, refresh]);

  const manifests = useMemo(
    () => installedPacks.map(({ manifest }) => manifest),
    [installedPacks],
  );

  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    const frame = requestAnimationFrame(() => focusMainContent(document));
    return () => cancelAnimationFrame(frame);
  }, [hash]);

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
          installedPacks={installedPacks}
          advertisedPacks={advertisedPacks}
          contentDownloads={contentDownloads}
          {...(activeProfile === undefined ? {} : { activeProfile })}
          {...(runtimeContentError === undefined
            ? {}
            : { runtimeContentError })}
          onChanged={refresh}
          onRetryAdvertised={installAdvertisedPack}
        />
      ) : route.page === "characters" ? (
        route.characterId === undefined ? (
          <CharacterLibraryPage
            manifests={manifests}
            {...(activePackId === undefined ? {} : { activePackId })}
            {...(activeProfile === undefined ? {} : { activeProfile })}
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
