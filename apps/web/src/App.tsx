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
import { IMPORT_NAME_MATCHING_STORAGE_KEY } from "./import-report";
import { preferredPrintCardTextSize } from "./print-card-fit";
import { HideFlavortextContext } from "./HideFlavortextContext";
import { ShowEntitySourceContext } from "./ShowEntitySourceContext";
import {
  PAPER_SIZE_STORAGE_KEY,
  storedPaperSize,
  type PaperSize,
} from "./paper-size";
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
import { LoadingScreen } from "./LoadingScreen";
import { PwaUpdateProvider } from "./PwaUpdate";
import {
  downloadAdvertisedPack,
  parseRuntimeContentConfig,
  shouldActivateAdvertisedContent,
  type AdvertisedContentPack,
} from "./runtime-content";
import { appContentRuntime } from "./app-runtime";
import { ACTIVE_PROFILE_ID, ACTIVE_PROFILE_NAME } from "./content-profile-ui";
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
const SHOW_ENTITY_SOURCE_STORAGE_KEY = "4ecb.showEntitySource.v1";
export const MERGE_FUNDS_STORAGE_KEY = "4ecb.mergeFunds.v1";
export const RESOLVE_ABILITY_CHOICES_STORAGE_KEY =
  "4ecb.resolveAbilityChoices.v1";
export const PROFICIENT_EQUIPMENT_ONLY_STORAGE_KEY =
  "4ecb.proficientEquipmentOnly.v1";
export const ABBREVIATE_ABILITY_VALUES_STORAGE_KEY =
  "4ecb.abbreviateAbilityValues.v1";
export const PRINT_CARD_TEXT_SIZE_STORAGE_KEY = "4ecb.printCardTextSize.v1";
export const COUNT_COIN_WEIGHT_STORAGE_KEY = "4ecb.countCoinWeight.v1";

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
  const [showEntitySource, setShowEntitySource] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SHOW_ENTITY_SOURCE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [matchContentByName, setMatchContentByName] = useState(() => {
    try {
      return localStorage.getItem(IMPORT_NAME_MATCHING_STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [mergeFunds, setMergeFunds] = useState(() => {
    try {
      return localStorage.getItem(MERGE_FUNDS_STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [resolveAbilityChoices, setResolveAbilityChoices] = useState(() => {
    try {
      return localStorage.getItem(RESOLVE_ABILITY_CHOICES_STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [proficientEquipmentOnly, setProficientEquipmentOnly] = useState(() => {
    try {
      return (
        localStorage.getItem(PROFICIENT_EQUIPMENT_ONLY_STORAGE_KEY) !== "0"
      );
    } catch {
      return true;
    }
  });
  const [abbreviateAbilityValues, setAbbreviateAbilityValues] = useState(() => {
    try {
      return (
        localStorage.getItem(ABBREVIATE_ABILITY_VALUES_STORAGE_KEY) !== "0"
      );
    } catch {
      return true;
    }
  });
  const [paperSize, setPaperSizeState] = useState<PaperSize>(storedPaperSize);
  // Stored only once chosen, so the default keeps following the locale.
  const setPaperSize = useCallback((next: PaperSize) => {
    setPaperSizeState(next);
    try {
      localStorage.setItem(PAPER_SIZE_STORAGE_KEY, next);
    } catch {
      // The paper preference still applies for this session.
    }
  }, []);
  const firstRoute = useRef(true);
  const [countCoinWeight, setCountCoinWeight] = useState(() => {
    try {
      return localStorage.getItem(COUNT_COIN_WEIGHT_STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      if (countCoinWeight)
        localStorage.removeItem(COUNT_COIN_WEIGHT_STORAGE_KEY);
      else localStorage.setItem(COUNT_COIN_WEIGHT_STORAGE_KEY, "0");
    } catch {
      // The encumbrance preference still applies for this session.
    }
  }, [countCoinWeight]);
  const runtimeContentStarted = useRef(false);
  const [printCardTextSize, setPrintCardTextSize] = useState(() => {
    try {
      return preferredPrintCardTextSize(
        localStorage.getItem(PRINT_CARD_TEXT_SIZE_STORAGE_KEY),
      );
    } catch {
      return 8;
    }
  });
  const route = useMemo(() => parseHashRoute(hash), [hash]);
  // Where Settings' close (and Esc) returns: the last other page visited.
  const [settingsReturnHash, setSettingsReturnHash] = useState("#/characters");
  useEffect(() => {
    if (route.page !== "settings" && hash !== "") setSettingsReturnHash(hash);
  }, [hash, route.page]);
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
      if (showEntitySource)
        localStorage.setItem(SHOW_ENTITY_SOURCE_STORAGE_KEY, "1");
      else localStorage.removeItem(SHOW_ENTITY_SOURCE_STORAGE_KEY);
    } catch {
      // The visual preference still applies for this session.
    }
  }, [showEntitySource]);
  useEffect(() => {
    try {
      if (resolveAbilityChoices)
        localStorage.removeItem(RESOLVE_ABILITY_CHOICES_STORAGE_KEY);
      else localStorage.setItem(RESOLVE_ABILITY_CHOICES_STORAGE_KEY, "0");
    } catch {
      // The power-card display preference still applies for this session.
    }
  }, [resolveAbilityChoices]);
  useEffect(() => {
    try {
      if (proficientEquipmentOnly)
        localStorage.removeItem(PROFICIENT_EQUIPMENT_ONLY_STORAGE_KEY);
      else localStorage.setItem(PROFICIENT_EQUIPMENT_ONLY_STORAGE_KEY, "0");
    } catch {
      // The power-card display preference still applies for this session.
    }
  }, [proficientEquipmentOnly]);
  useEffect(() => {
    try {
      if (matchContentByName)
        localStorage.removeItem(IMPORT_NAME_MATCHING_STORAGE_KEY);
      else localStorage.setItem(IMPORT_NAME_MATCHING_STORAGE_KEY, "0");
    } catch {
      // The import preference still applies for this session.
    }
  }, [matchContentByName]);
  useEffect(() => {
    try {
      if (mergeFunds) localStorage.removeItem(MERGE_FUNDS_STORAGE_KEY);
      else localStorage.setItem(MERGE_FUNDS_STORAGE_KEY, "0");
    } catch {
      // The funds preference still applies for this session.
    }
  }, [mergeFunds]);
  useEffect(() => {
    try {
      if (abbreviateAbilityValues)
        localStorage.removeItem(ABBREVIATE_ABILITY_VALUES_STORAGE_KEY);
      else localStorage.setItem(ABBREVIATE_ABILITY_VALUES_STORAGE_KEY, "0");
    } catch {
      // The power-card display preference still applies for this session.
    }
  }, [abbreviateAbilityValues]);

  useEffect(() => {
    try {
      localStorage.setItem(
        PRINT_CARD_TEXT_SIZE_STORAGE_KEY,
        String(printCardTextSize),
      );
    } catch {
      // The print-card preference still applies for this session.
    }
  }, [printCardTextSize]);

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
      // The browser follows the group's content: it starts on it, and moves
      // to a newly advertised revision unless the user assembled content of
      // their own. Characters stay pinned until the user reviews the update.
      const available = await repository.listInstalled();
      if (
        shouldActivateAdvertisedContent(
          await repository.activeProfile(),
          configured.contentPacks,
          (packId) =>
            available.find(({ manifest }) => manifest.packId === packId)
              ?.origin,
        )
      ) {
        if (
          configured.contentPacks.every((advertised) =>
            available.some(
              ({ manifest }) =>
                manifest.packId === advertised.packId &&
                manifest.contentDigest === advertised.contentDigest,
            ),
          )
        ) {
          await repository.activateProfile(
            ACTIVE_PROFILE_ID,
            ACTIVE_PROFILE_NAME,
            configured.contentPacks.map(({ packId }) => packId),
          );
          await refreshAfterContentChange();
        }
      }
    } catch (reason: unknown) {
      setRuntimeContentError(
        reason instanceof Error ? reason.message : String(reason),
      );
    }
  }, [installAdvertisedPack, refreshAfterContentChange]);

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
  const activeManifest = useMemo(
    () => manifests.find((manifest) => manifest.packId === activePackId),
    [manifests, activePackId],
  );

  useEffect(() => {
    previousRoute.current = route;
    if (firstRoute.current) {
      firstRoute.current = false;
    }
  }, [route]);

  return (
    <PwaUpdateProvider>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {error === undefined ? null : (
          <div className="global-error error" role="alert">
            <strong>Storage problem</strong>
            <span>{error}</span>
          </div>
        )}

        <HideFlavortextContext.Provider value={hideFlavortext}>
          <ShowEntitySourceContext.Provider value={showEntitySource}>
            {!storageReady ? (
              <LoadingScreen label="Loading local content profiles…" />
            ) : (
              <Suspense
                fallback={
                  <LoadingScreen
                    className="route-loading-state"
                    label="Loading workspace…"
                    routeLoading
                  />
                }
              >
                <RouteFocusOnMount enabled={focusRouteOnMount} focusKey={hash}>
                  {route.page === "settings" ? (
                    <SettingsRoute
                      installedPacks={installedPacks}
                      advertisedPacks={advertisedPacks}
                      contentDownloads={contentDownloads}
                      {...(activeProfile === undefined
                        ? {}
                        : { activeProfile })}
                      {...(runtimeContentError === undefined
                        ? {}
                        : { runtimeContentError })}
                      onChanged={refreshAfterContentChange}
                      onRetryAdvertised={installAdvertisedPack}
                      theme={theme}
                      onThemeChange={setTheme}
                      hideFlavortext={hideFlavortext}
                      onHideFlavortextChange={setHideFlavortext}
                      showEntitySource={showEntitySource}
                      onShowEntitySourceChange={setShowEntitySource}
                      mergeFunds={mergeFunds}
                      onMergeFundsChange={setMergeFunds}
                      matchContentByName={matchContentByName}
                      onMatchContentByNameChange={setMatchContentByName}
                      countCoinWeight={countCoinWeight}
                      onCountCoinWeightChange={setCountCoinWeight}
                      resolveAbilityChoices={resolveAbilityChoices}
                      onResolveAbilityChoicesChange={setResolveAbilityChoices}
                      proficientEquipmentOnly={proficientEquipmentOnly}
                      onProficientEquipmentOnlyChange={
                        setProficientEquipmentOnly
                      }
                      abbreviateAbilityValues={abbreviateAbilityValues}
                      onAbbreviateAbilityValuesChange={
                        setAbbreviateAbilityValues
                      }
                      printCardTextSize={printCardTextSize}
                      onPrintCardTextSizeChange={setPrintCardTextSize}
                      paperSize={paperSize}
                      onPaperSizeChange={setPaperSize}
                      closeHref={settingsReturnHash}
                    />
                  ) : route.characterId === undefined ? (
                    <CharacterLibraryPage
                      manifests={manifests}
                      matchMissingContentByName={matchContentByName}
                      {...(activePackId === undefined ? {} : { activePackId })}
                      {...(activeProfile === undefined
                        ? {}
                        : { activeProfile })}
                    />
                  ) : route.mode === "edit" ? (
                    <EditorRoute
                      characterId={route.characterId}
                      navigation={route.builder ?? { workspace: "build" }}
                      onNavigate={navigateBuilder}
                      mergeFunds={mergeFunds}
                      resolveAbilityChoices={resolveAbilityChoices}
                      proficientEquipmentOnly={proficientEquipmentOnly}
                      abbreviateAbilityValues={abbreviateAbilityValues}
                      {...(activeManifest === undefined
                        ? {}
                        : { activeManifest })}
                      {...(activeProfile === undefined
                        ? {}
                        : { activeProfile })}
                    />
                  ) : (
                    <SheetRoute
                      characterId={route.characterId}
                      manifests={manifests}
                      printOnReady={route.print === true}
                      openPrintPreview={route.preview === true}
                      countCoinWeight={countCoinWeight}
                      resolveAbilityChoices={resolveAbilityChoices}
                      proficientEquipmentOnly={proficientEquipmentOnly}
                      abbreviateAbilityValues={abbreviateAbilityValues}
                      printCardTextSize={printCardTextSize}
                      paper={paperSize}
                    />
                  )}
                </RouteFocusOnMount>
              </Suspense>
            )}
          </ShowEntitySourceContext.Provider>
        </HideFlavortextContext.Provider>
      </div>
    </PwaUpdateProvider>
  );
}
