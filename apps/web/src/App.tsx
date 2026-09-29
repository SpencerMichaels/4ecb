import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  ContentPackRepository,
  type ContentProfileDefinition,
  type InstalledContentPack,
} from "@4ecb/browser-storage";
import { storeAlreadyValidatedContentPack } from "@4ecb/browser-storage/validated-pack-storage";

import { CharacterLibraryPage } from "./CharacterLibraryPage";
import { HideFlavortextContext } from "./HideFlavortextContext";
import { Icon } from "./Icon";
import {
  canonicalHashRedirect,
  characterEditorHash,
  commitHashNavigation,
  parseHashRoute,
  type BuilderNavigation,
} from "./routes";
import {
  focusMainContent,
  shouldFocusMainContentAfterRouteChange,
} from "./route-focus";
import { PwaStatus } from "./PwaStatus";
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

const loadCharacterEditorPage = () =>
  import("./CharacterEditorPage").then((module) => ({
    default: module.CharacterEditorPage,
  }));
const loadCharacterSheetPage = () =>
  import("./CharacterSheetPage").then((module) => ({
    default: module.CharacterSheetPage,
  }));
const loadSettingsPage = () =>
  import("./SettingsPage").then((module) => ({
    default: module.SettingsPage,
  }));

const initialRoute = parseHashRoute(window.location.hash);
const initialEditorPage =
  initialRoute.page === "characters" && initialRoute.mode === "edit"
    ? loadCharacterEditorPage()
    : undefined;
const initialSheetPage =
  initialRoute.page === "characters" &&
  initialRoute.characterId !== undefined &&
  initialRoute.mode !== "edit"
    ? loadCharacterSheetPage()
    : undefined;
const initialSettingsPage =
  initialRoute.page === "settings" ? loadSettingsPage() : undefined;

let initialEditorPageComponent:
  Awaited<ReturnType<typeof loadCharacterEditorPage>>["default"] | undefined;
let initialSheetPageComponent:
  Awaited<ReturnType<typeof loadCharacterSheetPage>>["default"] | undefined;
let initialSettingsPageComponent:
  Awaited<ReturnType<typeof loadSettingsPage>>["default"] | undefined;

export const initialRouteReady = Promise.all([
  initialEditorPage?.then(({ default: component }) => {
    initialEditorPageComponent = component;
  }),
  initialSheetPage?.then(({ default: component }) => {
    initialSheetPageComponent = component;
  }),
  initialSettingsPage?.then(({ default: component }) => {
    initialSettingsPageComponent = component;
  }),
]);

const CharacterEditorPage = lazy(
  () => initialEditorPage ?? loadCharacterEditorPage(),
);
const CharacterSheetPage = lazy(
  () => initialSheetPage ?? loadCharacterSheetPage(),
);
const SettingsPage = lazy(() => initialSettingsPage ?? loadSettingsPage());

const HIDE_FLAVORTEXT_STORAGE_KEY = "4ecb.hideFlavortext.v1";
export const KEEP_LARGE_AMOUNTS_IN_GOLD_STORAGE_KEY =
  "4ecb.keepLargeAmountsInGold.v1";
export const RESOLVE_ABILITY_CHOICES_STORAGE_KEY =
  "4ecb.resolveAbilityChoices.v1";

function RouteFocusOnMount({
  children,
  enabled,
  focusKey,
}: {
  readonly children: ReactNode;
  readonly enabled: boolean;
  readonly focusKey: string;
}) {
  useEffect(() => {
    if (enabled) focusMainContent(document);
  }, [enabled, focusKey]);
  return children;
}

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
  const [keepLargeAmountsInGold, setKeepLargeAmountsInGold] = useState(() => {
    try {
      return (
        localStorage.getItem(KEEP_LARGE_AMOUNTS_IN_GOLD_STORAGE_KEY) === "1"
      );
    } catch {
      return false;
    }
  });
  const [resolveAbilityChoices, setResolveAbilityChoices] = useState(() => {
    try {
      return localStorage.getItem(RESOLVE_ABILITY_CHOICES_STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const firstRoute = useRef(true);
  const runtimeContentStarted = useRef(false);
  const route = useMemo(() => parseHashRoute(hash), [hash]);
  const previousRoute = useRef(route);
  const focusRouteOnMount =
    !firstRoute.current &&
    shouldFocusMainContentAfterRouteChange(previousRoute.current, route);
  const EditorRoute = initialEditorPageComponent ?? CharacterEditorPage;
  const SheetRoute = initialSheetPageComponent ?? CharacterSheetPage;
  const SettingsRoute = initialSettingsPageComponent ?? SettingsPage;
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
  useEffect(() => {
    try {
      if (keepLargeAmountsInGold)
        localStorage.setItem(KEEP_LARGE_AMOUNTS_IN_GOLD_STORAGE_KEY, "1");
      else localStorage.removeItem(KEEP_LARGE_AMOUNTS_IN_GOLD_STORAGE_KEY);
    } catch {
      // The wallet preference still applies for this session.
    }
  }, [keepLargeAmountsInGold]);
  useEffect(() => {
    try {
      if (resolveAbilityChoices)
        localStorage.removeItem(RESOLVE_ABILITY_CHOICES_STORAGE_KEY);
      else localStorage.setItem(RESOLVE_ABILITY_CHOICES_STORAGE_KEY, "0");
    } catch {
      // The power-card display preference still applies for this session.
    }
  }, [resolveAbilityChoices]);

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
    async (
      advertised: AdvertisedContentPack,
      knownInstalled?: Map<string, InstalledContentPack>,
    ): Promise<void> => {
      setContentDownloads((current) => ({
        ...current,
        [advertised.packId]: { phase: "queued" },
      }));
      try {
        const current =
          knownInstalled ??
          new Map(
            (await repository.listInstalled()).map((entry) => [
              entry.manifest.packId,
              entry,
            ]),
          );
        const exact = [...current.values()].find(
          ({ manifest }) =>
            manifest.packId === advertised.packId &&
            manifest.contentDigest === advertised.contentDigest,
        );
        if (exact?.origin !== "server") {
          const conflicting = [...current.values()].find(
            ({ manifest }) =>
              manifest.packId === advertised.packId &&
              manifest.contentDigest !== advertised.contentDigest,
          );
          if (conflicting !== undefined)
            throw new Error(
              `Pack ID ${advertised.packId} is already installed with digest ${conflicting.manifest.contentDigest}. The administrator must publish a revision-qualified pack ID to preserve pinned characters.`,
            );
          const { pack, validated } = await downloadAdvertisedPack(
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
          await storeAlreadyValidatedContentPack(validated, {
            origin: "server",
            advertised,
          });
          current.set(advertised.packId, {
            manifest: pack.manifest,
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
      const installed = new Map(
        (await repository.listInstalled()).map((entry) => [
          entry.manifest.packId,
          entry,
        ]),
      );
      for (const advertised of configured.contentPacks)
        await installAdvertisedPack(advertised, installed);
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
    previousRoute.current = route;
    if (firstRoute.current) {
      firstRoute.current = false;
    }
  }, [route]);

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
        ) : (
          <Suspense
            fallback={
              <main
                aria-busy="true"
                className="loading-state route-loading-state"
                data-route-loading="true"
                id="main-content"
              >
                Loading workspace…
              </main>
            }
          >
            <RouteFocusOnMount enabled={focusRouteOnMount} focusKey={hash}>
              {route.page === "settings" ? (
                <SettingsRoute
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
                  keepLargeAmountsInGold={keepLargeAmountsInGold}
                  onKeepLargeAmountsInGoldChange={setKeepLargeAmountsInGold}
                  resolveAbilityChoices={resolveAbilityChoices}
                  onResolveAbilityChoicesChange={setResolveAbilityChoices}
                />
              ) : route.characterId === undefined ? (
                <CharacterLibraryPage
                  manifests={manifests}
                  {...(activePackId === undefined ? {} : { activePackId })}
                  {...(activeProfile === undefined ? {} : { activeProfile })}
                />
              ) : route.mode === "edit" ? (
                <EditorRoute
                  characterId={route.characterId}
                  navigation={route.builder ?? { workspace: "build" }}
                  onNavigate={navigateBuilder}
                  keepLargeAmountsInGold={keepLargeAmountsInGold}
                  resolveAbilityChoices={resolveAbilityChoices}
                />
              ) : (
                <SheetRoute
                  characterId={route.characterId}
                  manifests={manifests}
                  printOnReady={route.print === true}
                  resolveAbilityChoices={resolveAbilityChoices}
                />
              )}
            </RouteFocusOnMount>
          </Suspense>
        )}
      </HideFlavortextContext.Provider>
    </div>
  );
}
