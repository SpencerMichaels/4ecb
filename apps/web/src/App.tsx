import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ContentPackRepository,
  type ContentProfileDefinition,
  type InstalledContentPack,
} from "@4ecb/browser-storage";

import { CharacterLibraryPage } from "./CharacterLibraryPage";
import { CharacterEditorPage } from "./CharacterEditorPage";
import { CharacterSheetPage } from "./CharacterSheetPage";
import { HideFlavortextContext } from "./EntityCard";
import { Icon } from "./Icon";
import {
  canonicalHashRedirect,
  characterEditorHash,
  commitHashNavigation,
  parseHashRoute,
  type BuilderNavigation,
} from "./routes";
import { focusMainContent } from "./route-focus";
import { PwaStatus } from "./PwaStatus";
import { SettingsPage } from "./SettingsPage";
import {
  downloadAdvertisedPack,
  parseRuntimeContentConfig,
  type AdvertisedContentPack,
} from "./runtime-content";
import { appContentRuntime } from "./app-runtime";
import {
  applyThemePreference,
  parseThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "./theme";

const repository = new ContentPackRepository();

const HIDE_FLAVORTEXT_STORAGE_KEY = "4ecb.hideFlavortext.v1";

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
  const [theme, setTheme] = useState<ThemePreference>(() => {
    try {
      return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
      return "system";
    }
  });
  const [hideFlavortext, setHideFlavortext] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HIDE_FLAVORTEXT_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const firstRoute = useRef(true);
  const runtimeContentStarted = useRef(false);
  const route = useMemo(() => parseHashRoute(hash), [hash]);
  const navigateBuilder = useCallback(
    (characterId: string, navigation: BuilderNavigation, replace = false) => {
      const next = characterEditorHash(characterId, navigation);
      if (commitHashNavigation(window, next, replace)) setHash(next);
    },
    [],
  );
  useEffect(() => {
    applyThemePreference(document.documentElement, theme);
    try {
      if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The visual preference still applies for this session.
    }
  }, [theme]);
  useEffect(() => {
    try {
      if (hideFlavortext)
        localStorage.setItem(HIDE_FLAVORTEXT_STORAGE_KEY, "1");
      else localStorage.removeItem(HIDE_FLAVORTEXT_STORAGE_KEY);
    } catch {
      // The visual preference still applies for this session.
    }
  }, [hideFlavortext]);

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

  const refreshAfterContentChange = useCallback(async () => {
    appContentRuntime.clear();
    await refresh();
  }, [refresh]);

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

  useEffect(() => {
    const redirect = canonicalHashRedirect(hash);
    if (redirect === undefined) return;
    window.history.replaceState(null, "", redirect);
    setHash(redirect);
  }, [hash]);

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
        <a
          className="app-brand"
          href="#/characters"
          aria-label="4E Character Builder home"
        >
          <span className="app-brand-mark">4E</span>
          <span className="app-brand-name">
            <strong>Character Builder</strong>
            <small>Fourth Edition</small>
          </span>
        </a>
        <nav className="app-header-nav" aria-label="Primary navigation">
          <a
            aria-current={route.page === "characters" ? "page" : undefined}
            href="#/characters"
          >
            <Icon name="character" /> Characters
          </a>
          <a
            aria-current={route.page === "settings" ? "page" : undefined}
            href="#/settings"
          >
            <Icon name="content" /> Settings
          </a>
        </nav>
      </header>

      <PwaStatus />

      {error === undefined ? null : (
        <div className="global-error error" role="alert">
          <strong>Storage problem</strong>
          <span>{error}</span>
        </div>
      )}

      <HideFlavortextContext.Provider value={hideFlavortext}>
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
            onChanged={refreshAfterContentChange}
            onRetryAdvertised={installAdvertisedPack}
            theme={theme}
            onThemeChange={setTheme}
            hideFlavortext={hideFlavortext}
            onHideFlavortextChange={setHideFlavortext}
          />
        ) : route.characterId === undefined ? (
          <CharacterLibraryPage
            manifests={manifests}
            {...(activePackId === undefined ? {} : { activePackId })}
            {...(activeProfile === undefined ? {} : { activeProfile })}
          />
        ) : route.mode === "edit" ? (
          <CharacterEditorPage
            characterId={route.characterId}
            navigation={route.builder ?? { workspace: "build" }}
            onNavigate={navigateBuilder}
          />
        ) : (
          <CharacterSheetPage
            characterId={route.characterId}
            manifests={manifests}
          />
        )}
      </HideFlavortextContext.Provider>
      <footer className="public-notice">
        <strong>Unofficial, local-first software.</strong> This project is not
        affiliated with or endorsed by Wizards of the Coast. Public builds do
        not include the official rules corpus; imported packs and characters
        remain in this browser unless you explicitly export them.
      </footer>
    </div>
  );
}
