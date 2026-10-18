import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import {
  CharacterRepository,
  ContentPackRepository,
  type CharacterBackupInspection,
  type ContentProfileDefinition,
  type InstalledContentPack,
} from "@4ecb/browser-storage";
import {
  contentPackIdentityErrors,
  MAX_CONTENT_PACK_ENCODED_BYTES,
  type ContentPackManifest,
} from "@4ecb/content-pack";

import type {
  ContentImportRequest,
  ImportPackProgressPhase,
  ImportPackResponse,
} from "./worker-messages";
import {
  chooseContentDirectory,
  classifyContentSource,
  discoverContentSources,
  supportsDirectoryPicker,
  type ContentSourceKind,
  type DiscoveredContentSource,
} from "./content-onboarding";
import type { ContentDownloadState } from "./App";
import { Icon } from "./Icon";
import {
  ACTIVE_PROFILE_ID,
  ACTIVE_PROFILE_NAME,
  contentRows,
  enabledLayers,
  layerKey,
  moveRow,
  replaceRow,
  sameProfileLayers,
  updateRow,
  type ContentRow,
} from "./content-profile-ui";
import { contentProfileMatchesRevision } from "./profile-migration";
import type { AdvertisedContentPack } from "./runtime-content";
import type { ThemePreference } from "./theme";
import {
  DEFAULT_PRINT_CARD_TEXT_SIZE,
  MAX_PRINT_CARD_TEXT_SIZE,
  MIN_PRINT_CARD_TEXT_SIZE,
} from "./print-card-fit";

const repository = new ContentPackRepository();
const characterRepository = new CharacterRepository();

function download(name: string, contents: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

interface StorageStatus {
  readonly supported: boolean;
  readonly persistenceSupported: boolean;
  readonly persisted?: boolean;
  readonly usage?: number;
  readonly quota?: number;
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "Unavailable";
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

async function readStorageStatus(): Promise<StorageStatus> {
  const storage = navigator.storage;
  if (storage === undefined)
    return { supported: false, persistenceSupported: false };
  const persistenceSupported = typeof storage.persisted === "function";
  const [estimate, persisted] = await Promise.all([
    typeof storage.estimate === "function"
      ? storage.estimate()
      : Promise.resolve<StorageEstimate>({}),
    persistenceSupported
      ? storage.persisted()
      : Promise.resolve<boolean | undefined>(undefined),
  ]);
  return {
    supported: true,
    persistenceSupported:
      persistenceSupported && typeof storage.persist === "function",
    ...(persisted === undefined ? {} : { persisted }),
    ...(estimate.usage === undefined ? {} : { usage: estimate.usage }),
    ...(estimate.quota === undefined ? {} : { quota: estimate.quota }),
  };
}

const CONTENT_ORDER_STORAGE_KEY = "4ecb.content-order";

/** The remembered table order, including packs that are turned off. */
function readOrder(): readonly string[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(CONTENT_ORDER_STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(value)
      ? value.filter((key): key is string => typeof key === "string")
      : [];
  } catch {
    return [];
  }
}

function phaseLabel(phase: ImportPackProgressPhase): string {
  switch (phase) {
    case "decoding":
      return "Decoding pack…";
    case "parsing-rules":
      return "Parsing legacy rules XML…";
    case "building-pack":
      return "Building a portable pack…";
    case "validating":
      return "Validating digest and records…";
    case "storing":
      return "Saving pack locally…";
  }
}

export interface SettingsPageProps {
  readonly installedPacks: readonly InstalledContentPack[];
  readonly advertisedPacks: readonly AdvertisedContentPack[];
  readonly activeProfile?: ContentProfileDefinition;
  readonly contentDownloads: Readonly<Record<string, ContentDownloadState>>;
  readonly runtimeContentError?: string;
  readonly onChanged: () => Promise<void>;
  readonly onRetryAdvertised: (
    advertised: AdvertisedContentPack,
  ) => Promise<void>;
  readonly theme: ThemePreference;
  readonly onThemeChange: (theme: ThemePreference) => void;
  readonly hideFlavortext: boolean;
  readonly onHideFlavortextChange: (hideFlavortext: boolean) => void;
  readonly keepLargeAmountsInGold: boolean;
  readonly countCoinWeight: boolean;
  readonly onCountCoinWeightChange: (value: boolean) => void;
  readonly onKeepLargeAmountsInGoldChange: (value: boolean) => void;
  readonly mergeFunds: boolean;
  readonly onMergeFundsChange: (value: boolean) => void;
  readonly resolveAbilityChoices: boolean;
  readonly onResolveAbilityChoicesChange: (value: boolean) => void;
  readonly abbreviateAbilityValues: boolean;
  readonly onAbbreviateAbilityValuesChange: (value: boolean) => void;
  readonly showEquippedAttackBonus: boolean;
  readonly onShowEquippedAttackBonusChange: (value: boolean) => void;
  readonly showPrintTitleActionIcon: boolean;
  readonly onShowPrintTitleActionIconChange: (value: boolean) => void;
  readonly printCardTextSize: number;
  readonly onPrintCardTextSizeChange: (value: number) => void;
}

function cardTextSizeDescription(size: number): string {
  const steps = Math.round((size - DEFAULT_PRINT_CARD_TEXT_SIZE) / 0.5);
  if (steps === 0) return "Default";
  const count = Math.abs(steps);
  return `${count} ${count === 1 ? "step" : "steps"} ${steps < 0 ? "smaller" : "larger"} than default`;
}

function CheckboxSetting({
  checked,
  onChange,
  label,
  help,
}: {
  readonly checked: boolean;
  readonly onChange: (value: boolean) => void;
  readonly label: string;
  readonly help?: string;
}) {
  const helpId = useId();
  return (
    <div className="settings-option">
      <label className="settings-check">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.currentTarget.checked)}
          {...(help === undefined ? {} : { "aria-describedby": helpId })}
        />
        <span>{label}</span>
      </label>
      {help === undefined ? null : (
        <p className="field-help" id={helpId}>
          {help}
        </p>
      )}
    </div>
  );
}

export function SettingsPage({
  installedPacks,
  advertisedPacks,
  activeProfile,
  contentDownloads,
  runtimeContentError,
  onChanged,
  onRetryAdvertised,
  theme,
  onThemeChange,
  hideFlavortext,
  onHideFlavortextChange,
  keepLargeAmountsInGold,
  countCoinWeight,
  onCountCoinWeightChange,
  onKeepLargeAmountsInGoldChange,
  mergeFunds,
  onMergeFundsChange,
  resolveAbilityChoices,
  onResolveAbilityChoicesChange,
  abbreviateAbilityValues,
  onAbbreviateAbilityValuesChange,
  showEquippedAttackBonus,
  onShowEquippedAttackBonusChange,
  showPrintTitleActionIcon,
  onShowPrintTitleActionIconChange,
  printCardTextSize,
  onPrintCardTextSizeChange,
}: SettingsPageProps) {
  const [status, setStatus] = useState(
    installedPacks.length === 0 ? "No content packs installed." : "Ready.",
  );
  const [error, setError] = useState<string>();
  const [libraryStatus, setLibraryStatus] = useState("");
  const [libraryError, setLibraryError] = useState<string>();
  const [pendingBackup, setPendingBackup] = useState<{
    readonly value: unknown;
    readonly inspection: CharacterBackupInspection;
  }>();
  const [importing, setImporting] = useState(false);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>();
  const [requestingPersistence, setRequestingPersistence] = useState(false);
  const [scanningDirectory, setScanningDirectory] = useState(false);
  const [directorySources, setDirectorySources] = useState<
    readonly DiscoveredContentSource[]
  >([]);
  const [selectedSourcePath, setSelectedSourcePath] = useState("");
  const [localPackId, setLocalPackId] = useState("local-legacy-rules");
  const [localPackName, setLocalPackName] = useState(
    "Local legacy rules corpus",
  );
  const [savedOrder, setSavedOrder] = useState<readonly string[]>(readOrder);
  const [applying, setApplying] = useState(false);
  const [dragging, setDragging] = useState<number>();
  const [dropTarget, setDropTarget] = useState<number>();
  const [pendingRemove, setPendingRemove] = useState<{
    readonly row: ContentRow;
    readonly characters: number;
  }>();
  const workerRef = useRef<Worker | undefined>(undefined);
  const directoryPickerSupported = supportsDirectoryPicker(window);
  const serverLayers = advertisedPacks.map(({ packId, contentDigest }) => ({
    packId,
    contentDigest,
  }));
  const rows = contentRows(
    installedPacks,
    activeProfile?.layers ?? [],
    serverLayers,
    savedOrder,
  );
  const staleGroupRows = rows.filter(
    ({ origin, enabled, advertised }) =>
      origin === "server" && enabled && !advertised,
  );
  const newGroupRows = rows.filter(
    ({ advertised, enabled }) => advertised && !enabled,
  );
  const groupDownloads = advertisedPacks.map((advertised) => ({
    advertised,
    download: contentDownloads[advertised.packId],
  }));
  const downloading = groupDownloads.find(
    ({ download }) =>
      download?.phase === "downloading" || download?.phase === "installing",
  );
  const failedDownloads = groupDownloads.filter(
    ({ download }) => download?.phase === "error",
  );
  const busy = applying || importing;

  useEffect(() => {
    void readStorageStatus()
      .then(setStorageStatus)
      .catch(() =>
        setStorageStatus({
          supported: false,
          persistenceSupported: false,
        }),
      );
    return () => workerRef.current?.terminate();
  }, []);

  function showError(reason: unknown): void {
    setError(reason instanceof Error ? reason.message : String(reason));
  }

  function rememberOrder(next: readonly ContentRow[]): void {
    const order = next.map(layerKey);
    setSavedOrder(order);
    try {
      localStorage.setItem(CONTENT_ORDER_STORAGE_KEY, JSON.stringify(order));
    } catch {
      // The order still applies until the page reloads.
    }
  }

  /** Characters on the content in use now, which a change offers the update. */
  async function charactersOnActiveContent(): Promise<number> {
    if (activeProfile === undefined) return 0;
    const current = {
      packId: activeProfile.materializedPackId,
      contentDigest: activeProfile.contentDigest,
    };
    return (await characterRepository.list()).filter((character) =>
      contentProfileMatchesRevision(character.profileBinding, current),
    ).length;
  }

  /** Saves the table and, when the packs in use change, switches to them. */
  async function apply(
    next: readonly ContentRow[],
    done?: string,
  ): Promise<void> {
    rememberOrder(next);
    const layers = enabledLayers(next);
    if (sameProfileLayers(layers, activeProfile?.layers ?? [])) {
      if (done !== undefined) setStatus(done);
      return;
    }
    setApplying(true);
    setError(undefined);
    setStatus("Switching content…");
    try {
      const characters = await charactersOnActiveContent();
      if (layers.length === 0) await repository.deactivate();
      else
        await repository.activateProfile(
          ACTIVE_PROFILE_ID,
          ACTIVE_PROFILE_NAME,
          layers.map(({ packId }) => packId),
        );
      await onChanged();
      setStatus(
        [
          done ??
            (layers.length === 0
              ? "No content is in use."
              : "The builder now uses the content marked In use."),
          characters === 0 || layers.length === 0
            ? ""
            : `${characters} existing ${characters === 1 ? "character uses" : "characters use"} the previous content; when you open ${characters === 1 ? "it" : "one"}, you'll see what changes and can update it.`,
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (reason: unknown) {
      showError(reason);
      setStatus("Content wasn't changed.");
    } finally {
      setApplying(false);
    }
  }

  /** Characters pinned directly to this pack rather than to combined content. */
  async function charactersPinnedTo(row: ContentRow): Promise<number> {
    return (await characterRepository.list()).filter(
      ({ profileBinding }) =>
        profileBinding?.packId === row.packId &&
        (profileBinding.contentDigest === undefined ||
          profileBinding.contentDigest === row.contentDigest),
    ).length;
  }

  async function askRemove(row: ContentRow): Promise<void> {
    setPendingRemove({ row, characters: await charactersPinnedTo(row) });
  }

  async function remove(row: ContentRow): Promise<void> {
    setPendingRemove(undefined);
    const next = rows.filter(
      (candidate) => layerKey(candidate) !== layerKey(row),
    );
    await apply(next);
    await repository.remove(row.packId);
    await onChanged();
    setStatus(`Removed ${row.label} from this browser.`);
  }

  /** Puts a newly imported pack at the bottom, or in place of `replacing`. */
  async function added(
    manifest: ContentPackManifest,
    replacing: ContentRow | undefined,
  ): Promise<void> {
    const row: ContentRow = {
      packId: manifest.packId,
      contentDigest: manifest.contentDigest,
      label: manifest.name,
      origin: "personal",
      enabled: true,
      advertised: false,
    };
    const others = rows.filter(
      (candidate) => layerKey(candidate) !== layerKey(row),
    );
    if (replacing === undefined) {
      await apply([...others, row], `Added ${manifest.name} and turned it on.`);
      return;
    }
    await apply(
      replaceRow(others, replacing, row),
      `Replaced ${replacing.label} with ${manifest.name}.`,
    );
    if ((await charactersPinnedTo(replacing)) === 0) {
      await repository.remove(replacing.packId);
      await onChanged();
    }
  }

  function dropAt(to: number): void {
    if (dragging === undefined) return;
    const next = moveRow(rows, dragging, to);
    setDragging(undefined);
    setDropTarget(undefined);
    void apply(next, "Saved the new order.");
  }

  async function requestPersistence(): Promise<void> {
    if (typeof navigator.storage?.persist !== "function") return;
    setRequestingPersistence(true);
    try {
      const persisted = await navigator.storage.persist();
      setStorageStatus(await readStorageStatus());
      setStatus(
        persisted
          ? "Persistent browser storage was granted."
          : "The browser did not grant persistent storage; keep current backups and review browser site-data settings.",
      );
    } finally {
      setRequestingPersistence(false);
    }
  }

  async function importFile(
    file: File,
    sourceKind: ContentSourceKind,
    replacing?: ContentRow,
  ): Promise<void> {
    if (file.size > MAX_CONTENT_PACK_ENCODED_BYTES) {
      throw new Error("Content source exceeds the 128 MiB input limit");
    }
    if (sourceKind === "legacy-rules-xml") {
      const identityErrors = contentPackIdentityErrors(
        localPackId,
        localPackName,
      );
      if (identityErrors.length > 0)
        throw new Error(
          `Rules XML profile metadata is invalid: ${identityErrors.join("; ")}`,
        );
    }
    workerRef.current?.terminate();
    const worker = new Worker(new URL("./content.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    setImporting(true);
    setError(undefined);
    setStatus(`Reading ${file.name}…`);

    worker.onmessage = (event: MessageEvent<ImportPackResponse>) => {
      const response = event.data;
      if (response.type === "progress") {
        setStatus(phaseLabel(response.phase));
        return;
      }
      setImporting(false);
      worker.terminate();
      workerRef.current = undefined;
      if (response.type === "complete") {
        void added(response.manifest, replacing).catch(showError);
      } else {
        setError(response.message);
        setStatus("Import failed.");
      }
    };
    worker.onerror = (event) => {
      setError(event.message);
      setStatus("Import worker failed.");
      setImporting(false);
      worker.terminate();
      workerRef.current = undefined;
    };

    const buffer = await file.arrayBuffer();
    const request: ContentImportRequest =
      sourceKind === "portable-pack"
        ? { type: "import-pack", buffer }
        : {
            type: "import-legacy-rules",
            buffer,
            sourceKey: file.name,
            packId: localPackId,
            name: localPackName,
          };
    worker.postMessage(request, [buffer]);
  }

  async function scanDirectory(): Promise<void> {
    setScanningDirectory(true);
    setError(undefined);
    try {
      const directory = await chooseContentDirectory(window);
      setStatus(`Scanning ${directory.name} without reading file contents…`);
      const sources = await discoverContentSources(directory);
      setDirectorySources(sources);
      setSelectedSourcePath(sources[0]?.relativePath ?? "");
      setStatus(
        sources.length === 0
          ? "No portable .4ecp pack or decrypted/merged .dnd40 XML was found. Encrypted containers and .part files must first be merged with the local content tool."
          : `Found ${sources.length} supported content source${sources.length === 1 ? "" : "s"}. Choose one to validate and install.`,
      );
    } catch (reason: unknown) {
      if (reason instanceof DOMException && reason.name === "AbortError") {
        setStatus("Directory selection cancelled. No files were read.");
      } else {
        throw reason;
      }
    } finally {
      setScanningDirectory(false);
    }
  }

  async function importDiscoveredSource(): Promise<void> {
    const source = directorySources.find(
      (candidate) => candidate.relativePath === selectedSourcePath,
    );
    if (source === undefined) return;
    await importFile(await source.handle.getFile(), source.kind);
  }

  function cancelImport(): void {
    workerRef.current?.terminate();
    workerRef.current = undefined;
    setImporting(false);
    setStatus("Import cancelled. No changes were saved.");
  }

  function startFileImport(file: File, replacing?: ContentRow): void {
    const kind = classifyContentSource(file.name);
    if (kind === undefined) {
      setError("Choose a .4ecp pack or a decrypted/merged .dnd40 XML file.");
      setStatus("Import not started.");
      return;
    }
    void importFile(file, kind, replacing).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStatus("Import failed.");
      setImporting(false);
    });
  }

  async function exportBackup(): Promise<void> {
    setLibraryError(undefined);
    const backup = await characterRepository.exportBackup();
    download(
      `4ecb-characters-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(backup, null, 2),
      "application/json",
    );
    setLibraryStatus(
      `Backed up ${backup.characters.length} character record(s).`,
    );
  }

  async function inspectBackupFile(file: File): Promise<void> {
    setLibraryError(undefined);
    if (file.size > 100 * 1024 * 1024)
      throw new Error("Backup exceeds the 100 MiB inspection limit");
    const value: unknown = JSON.parse(await file.text());
    const inspection = await characterRepository.inspectBackup(value);
    setPendingBackup({ value, inspection });
    setLibraryStatus(
      `Inspected ${inspection.characterCount} backup record(s); no data has been restored yet.`,
    );
  }

  async function restoreInspectedBackup(): Promise<void> {
    if (pendingBackup === undefined) return;
    setLibraryError(undefined);
    const restored = await characterRepository.restoreBackup(
      pendingBackup.value,
    );
    setPendingBackup(undefined);
    setLibraryStatus(`Restored ${restored} backup record(s).`);
  }

  const focusFirstButton = useCallback((node: HTMLDivElement | null) => {
    if (node === null) return;
    node.scrollIntoView({ block: "nearest" });
    node.querySelector("button")?.focus({ preventScroll: true });
  }, []);

  return (
    <main className="settings-page" id="main-content">
      <header className="page-heading">
        <div>
          <h2>Settings</h2>
        </div>
        <div className="page-actions">
          <a
            aria-label="Close settings"
            className="icon-only-button button-icon"
            href="#/characters"
            title="Close settings"
          >
            <Icon name="remove" />
          </a>
        </div>
      </header>

      <div className="settings-columns">
        <section className="panel settings-section">
          <div>
            <h3>Display</h3>
            <p>How the app looks in this browser.</p>
          </div>
          <fieldset className="theme-options">
            <legend>Color theme</legend>
            {(
              [
                ["system", "System Default"],
                ["light", "Light"],
                ["dark", "Dark"],
              ] as const
            ).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={theme === value}
                  onChange={() => onThemeChange(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
        </section>

        <section className="panel settings-section">
          <div>
            <h3>Builder &amp; Equipment</h3>
            <p>Options for the builder, Equipment, and Shop.</p>
          </div>
          <div className="settings-options">
            <CheckboxSetting
              checked={hideFlavortext}
              onChange={onHideFlavortextChange}
              label="Hide flavortext"
            />
            <CheckboxSetting
              checked={keepLargeAmountsInGold}
              onChange={onKeepLargeAmountsInGoldChange}
              label="Keep large amounts in gold"
            />
            <CheckboxSetting
              checked={mergeFunds}
              onChange={onMergeFundsChange}
              label="Merge carried and stored funds"
              help="Show and edit one set of coins. Turn off to keep stored funds (a bank or stash) separate, with a Carried / Stored switch on the wallet."
            />
            <CheckboxSetting
              checked={abbreviateAbilityValues}
              onChange={onAbbreviateAbilityValuesChange}
              label="Show ability values compactly in calculated power details"
              help="On builder and on-screen sheet power cards, show “Charisma modifier (+4)” as an underlined “+4” whose tooltip names the ability. Printed cards keep the full wording."
            />
          </div>
        </section>

        <section className="panel settings-section">
          <div>
            <h3>Printed sheet</h3>
            <p>Options for the printable character sheet and its cards.</p>
          </div>
          <div className="settings-options">
            <CheckboxSetting
              checked={resolveAbilityChoices}
              onChange={onResolveAbilityChoicesChange}
              label="Use the best ability in power descriptions"
              help="When a power lets you choose an ability, show only the one with the highest modifier. Ties go to the higher score, then your class's key abilities, then the power's first option. Also applies to Equipment and Shop power cards."
            />
            <CheckboxSetting
              checked={countCoinWeight}
              onChange={onCountCoinWeightChange}
              label="Count coin weight"
              help="Include carried coins in encumbrance. Turn this off if your group ignores coin weight. Stored coins never count."
            />
            <CheckboxSetting
              checked={showEquippedAttackBonus}
              onChange={onShowEquippedAttackBonusChange}
              label="Show equipped weapon to-hit bonus in attack headers"
              help="Turn this off if you often switch weapons. Each card's weapon table always lists every weapon's bonus."
            />
            <CheckboxSetting
              checked={showPrintTitleActionIcon}
              onChange={onShowPrintTitleActionIconChange}
              label="Show action icons on printed cards"
              help="Show the action symbol beside each power name and in item-power headers. When off, power symbols appear only beside the action description."
            />
            <div className="settings-option">
              <label
                className="settings-check"
                htmlFor="settings-card-text-size"
              >
                Printed card text size
              </label>
              <div className="settings-slider">
                <span aria-hidden="true">Smaller</span>
                <input
                  id="settings-card-text-size"
                  type="range"
                  min={MIN_PRINT_CARD_TEXT_SIZE}
                  max={MAX_PRINT_CARD_TEXT_SIZE}
                  step={0.5}
                  value={printCardTextSize}
                  aria-describedby="settings-card-text-size-help"
                  aria-valuetext={cardTextSizeDescription(printCardTextSize)}
                  onChange={(event) =>
                    onPrintCardTextSizeChange(Number(event.currentTarget.value))
                  }
                />
                <span aria-hidden="true">Larger</span>
                <button
                  type="button"
                  className="settings-slider-reset"
                  disabled={printCardTextSize === DEFAULT_PRINT_CARD_TEXT_SIZE}
                  onClick={() =>
                    onPrintCardTextSizeChange(DEFAULT_PRINT_CARD_TEXT_SIZE)
                  }
                >
                  Reset
                </button>
              </div>
              <p className="field-help" id="settings-card-text-size-help">
                Cards use this size when space allows; dense cards shrink to
                fit. Titles and footers keep their size. Print preview flags
                cards that still overflow.
              </p>
            </div>
          </div>
        </section>

        <section className="panel settings-section">
          <div>
            <h3>Backups &amp; storage</h3>
            <p>
              Your characters and added content stay in this browser. Back up
              characters here, and keep copies of any added content-pack files
              separately.
            </p>
          </div>
          <p className="field-help">
            {storageStatus === undefined
              ? "Checking browser storage…"
              : storageStatus.persisted === true
                ? "This browser has granted persistent storage. Backups are still recommended."
                : "Browser storage may be cleared automatically. Backups are the reliable recovery path."}
          </p>
          <div className="heading-actions">
            <button
              type="button"
              onClick={() =>
                void exportBackup().catch((reason: unknown) =>
                  setLibraryError(
                    reason instanceof Error ? reason.message : String(reason),
                  ),
                )
              }
            >
              Back up library
            </button>
            <label className="file-button">
              Restore backup
              <input
                type="file"
                accept=".json,.4ecb,application/json"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file !== undefined)
                    void inspectBackupFile(file).catch((reason: unknown) =>
                      setLibraryError(
                        reason instanceof Error
                          ? reason.message
                          : String(reason),
                      ),
                    );
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
          {libraryStatus === "" ? null : (
            <p className="status" aria-live="polite">
              {libraryStatus}
            </p>
          )}
          {libraryError === undefined ? null : (
            <div className="error" role="alert">
              <strong>Library problem</strong>
              <span>{libraryError}</span>
            </div>
          )}
          {pendingBackup === undefined ? null : (
            <div className="backup-preview" aria-label="Backup restore preview">
              <h4>Restore preview</h4>
              <dl className="report-facts">
                <div>
                  <dt>Format</dt>
                  <dd>Version {pendingBackup.inspection.version}</dd>
                </div>
                <div>
                  <dt>Checksum</dt>
                  <dd>
                    {pendingBackup.inspection.checksumVerified
                      ? "Verified"
                      : "Unavailable in legacy backup"}
                  </dd>
                </div>
                <div>
                  <dt>Active</dt>
                  <dd>{pendingBackup.inspection.activeCount}</dd>
                </div>
                <div>
                  <dt>Trashed</dt>
                  <dd>{pendingBackup.inspection.trashedCount}</dd>
                </div>
                <div>
                  <dt>Existing IDs replaced</dt>
                  <dd>{pendingBackup.inspection.conflictingIds.length}</dd>
                </div>
              </dl>
              {!pendingBackup.inspection.checksumVerified ? (
                <p className="profile-warning">
                  This older backup has no checksum. Its records are
                  structurally valid, but payload integrity cannot be verified.
                </p>
              ) : null}
              <div className="inline-actions">
                <button
                  type="button"
                  onClick={() =>
                    void restoreInspectedBackup().catch((reason: unknown) =>
                      setLibraryError(
                        reason instanceof Error
                          ? reason.message
                          : String(reason),
                      ),
                    )
                  }
                >
                  Restore {pendingBackup.inspection.characterCount} record(s)
                </button>
                <button
                  type="button"
                  onClick={() => setPendingBackup(undefined)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="panel settings-section game-content-settings">
        <div>
          <h3>Game content</h3>
          <p>
            The rules, races, classes, powers, and items the builder offers.
            When two packs include the same entry, the lower row wins. Drag rows
            to change the order.
          </p>
        </div>

        {runtimeContentError === undefined ? null : (
          <div className="error" role="alert">
            <strong>Your group&apos;s content couldn&apos;t be loaded</strong>
            <span>{runtimeContentError}</span>
          </div>
        )}
        {downloading === undefined ? null : (
          <p className="status" aria-live="polite">
            {downloading.download?.phase === "installing"
              ? `Setting up ${downloading.advertised.name ?? "your group's content"}…`
              : `Downloading ${downloading.advertised.name ?? "your group's content"}${
                  downloading.download?.phase === "downloading" &&
                  downloading.download.totalBytes !== undefined
                    ? ` (${formatBytes(downloading.download.receivedBytes)} of ${formatBytes(downloading.download.totalBytes)})`
                    : ""
                }…`}
          </p>
        )}
        {failedDownloads.map(({ advertised, download }) => (
          <div className="error" role="alert" key={advertised.packId}>
            <strong>
              Couldn&apos;t download {advertised.name ?? "your group's content"}
            </strong>
            <span>{download?.error}</span>
            <div>
              <button
                type="button"
                onClick={() => void onRetryAdvertised(advertised)}
              >
                Try again
              </button>
            </div>
          </div>
        ))}

        {rows.length === 0 ? (
          <p className="game-content-empty">
            No content yet. Import a content pack to start building characters.
          </p>
        ) : (
          <table className="content-table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Order</span>
                </th>
                <th scope="col">Content pack</th>
                <th scope="col">In use</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const key = layerKey(row);
                const server = row.origin === "server";
                const canMoveUp =
                  index > 0 && rows[index - 1]?.origin === row.origin;
                const canMoveDown = rows[index + 1]?.origin === row.origin;
                const switchable =
                  server &&
                  staleGroupRows.length === 1 &&
                  newGroupRows.length === 1 &&
                  staleGroupRows[0] === row;
                return (
                  <Fragment key={key}>
                    <tr
                      className={[
                        row.enabled ? undefined : "content-row-off",
                        dragging === index ? "content-row-dragging" : undefined,
                        dropTarget === index && dragging !== index
                          ? dragging !== undefined && dragging < index
                            ? "content-row-drop-below"
                            : "content-row-drop-above"
                          : undefined,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      draggable={!busy && (canMoveUp || canMoveDown)}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", key);
                        setDragging(index);
                      }}
                      onDragOver={(event) => {
                        if (dragging === undefined) return;
                        if (rows[dragging]?.origin !== row.origin) return;
                        event.preventDefault();
                        setDropTarget(index);
                      }}
                      onDragEnd={() => {
                        setDragging(undefined);
                        setDropTarget(undefined);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        dropAt(index);
                      }}
                    >
                      <td className="content-row-handle">
                        {canMoveUp || canMoveDown ? (
                          <button
                            type="button"
                            className="button-icon"
                            disabled={busy}
                            aria-label={`Move ${row.label}. Use the up and down arrow keys.`}
                            title="Drag to reorder"
                            onKeyDown={(event) => {
                              const to =
                                event.key === "ArrowUp" && canMoveUp
                                  ? index - 1
                                  : event.key === "ArrowDown" && canMoveDown
                                    ? index + 1
                                    : undefined;
                              if (to === undefined) return;
                              event.preventDefault();
                              void apply(
                                moveRow(rows, index, to),
                                `Moved ${row.label} ${to < index ? "up" : "down"}.`,
                              );
                            }}
                          >
                            <span aria-hidden="true">⠿</span>
                          </button>
                        ) : null}
                      </td>
                      <td>
                        <strong>{row.label}</strong>
                        <span className="content-row-source">
                          {server
                            ? row.advertised
                              ? "From your group"
                              : "From your group (older version)"
                            : "Imported in this browser"}
                        </span>
                      </td>
                      <td>
                        <label className="content-row-toggle">
                          <input
                            type="checkbox"
                            checked={row.enabled}
                            disabled={busy}
                            onChange={(event) =>
                              void apply(
                                updateRow(rows, row, {
                                  enabled: event.currentTarget.checked,
                                }),
                              )
                            }
                          />
                          <span className="visually-hidden">
                            Use {row.label}
                          </span>
                        </label>
                      </td>
                      <td>
                        <div className="content-row-actions">
                          {switchable ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                const replacement = newGroupRows[0];
                                if (replacement !== undefined)
                                  void apply(
                                    replaceRow(rows, row, replacement),
                                    `Switched to ${replacement.label}.`,
                                  );
                              }}
                            >
                              Use new version
                            </button>
                          ) : null}
                          {server ? null : (
                            <label
                              className={`file-button${busy ? " disabled" : ""}`}
                            >
                              Replace…
                              <input
                                type="file"
                                accept=".4ecp,application/json"
                                disabled={busy}
                                onChange={(event) => {
                                  const file = event.currentTarget.files?.[0];
                                  if (file !== undefined)
                                    startFileImport(file, row);
                                  event.currentTarget.value = "";
                                }}
                              />
                            </label>
                          )}
                          {server && row.advertised ? null : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void askRemove(row).catch(showError)
                              }
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {pendingRemove === undefined ||
                    layerKey(pendingRemove.row) !== key ? null : (
                      <tr className="content-row-confirm">
                        <td colSpan={4}>
                          <div
                            className="content-change-review"
                            ref={focusFirstButton}
                          >
                            <p>
                              <strong>
                                Remove {row.label} from this browser?
                              </strong>{" "}
                              {pendingRemove.characters === 0
                                ? "No characters depend on it."
                                : `${pendingRemove.characters} ${pendingRemove.characters === 1 ? "character depends" : "characters depend"} on it and won't open until you import it again.`}
                            </p>
                            <div className="inline-actions">
                              <button
                                type="button"
                                onClick={() =>
                                  void remove(row).catch(showError)
                                }
                              >
                                Remove
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingRemove(undefined)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="heading-actions">
          <label className={`file-button${busy ? " disabled" : ""}`}>
            Import content pack…
            <input
              accept=".4ecp,application/json"
              type="file"
              disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file !== undefined) startFileImport(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
          {importing ? (
            <button type="button" onClick={cancelImport}>
              Cancel import
            </button>
          ) : null}
        </div>
        <p className="field-help">
          Turning content on or off, reordering, or replacing it doesn&apos;t
          change existing characters: each keeps its content until you open it
          and choose to update. Raw rules XML can be imported under Advanced
          content options.
        </p>
      </section>

      {status === "Ready." ? null : (
        <p className="status" aria-live="polite">
          {status}
        </p>
      )}
      {error === undefined ? null : (
        <div className="error" role="alert">
          <strong>Problem</strong>
          <span>{error}</span>
        </div>
      )}

      <details className="settings-advanced">
        <summary>Advanced content options</summary>
        <div className="settings-advanced-body">
          <section className="panel content-versions">
            <div>
              <h3>Exact versions</h3>
              <p>
                For troubleshooting: every content pack stored in this browser,
                with the identifiers characters are pinned to.
              </p>
            </div>
            {activeProfile === undefined ? null : (
              <p className="layer-digest">
                Combined content in use{" "}
                <code>{activeProfile.materializedPackId}</code>, digest{" "}
                <code>{activeProfile.contentDigest}</code>
              </p>
            )}
            <ul className="server-pack-list">
              {installedPacks
                .filter(({ origin }) => origin !== "profile")
                .map(({ manifest, origin }) => (
                  <li key={`${manifest.packId}:${manifest.contentDigest}`}>
                    <div>
                      <p className="eyebrow">
                        {origin === "server"
                          ? "From your group's server"
                          : "Added in this browser"}
                      </p>
                      <h4>{manifest.name}</h4>
                      <p className="identifier">{manifest.packId}</p>
                    </div>
                    <dl className="profile-facts">
                      <div>
                        <dt>Records</dt>
                        <dd>{manifest.recordCount.toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt>Warnings</dt>
                        <dd>
                          {manifest.diagnosticCounts.warning.toLocaleString()}
                        </dd>
                      </div>
                      <div className="digest-fact">
                        <dt>Digest</dt>
                        <dd>
                          <code>{manifest.contentDigest}</code>
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
            </ul>
          </section>

          <section className="panel content-onboarding">
            <div>
              <h3>Import raw rules XML</h3>
              <p>
                Turn a decrypted, merged `.dnd40.xml` rules file into a content
                pack in this browser. It then appears under Other content in
                this browser. Nothing is uploaded.
              </p>
            </div>
            <div className="onboarding-fields">
              <label>
                Pack ID (must differ from other packs)
                <input
                  value={localPackId}
                  disabled={importing}
                  onChange={(event) =>
                    setLocalPackId(event.currentTarget.value)
                  }
                />
              </label>
              <label>
                Pack name
                <input
                  value={localPackName}
                  disabled={importing}
                  onChange={(event) =>
                    setLocalPackName(event.currentTarget.value)
                  }
                />
              </label>
            </div>
            <label className="file-button">
              Import rules XML
              <input
                accept=".xml,application/xml,text/xml"
                type="file"
                disabled={importing}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file !== undefined) startFileImport(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {directoryPickerSupported ? (
              <button
                type="button"
                disabled={importing || scanningDirectory}
                onClick={() =>
                  void scanDirectory().catch((reason: unknown) => {
                    setError(
                      reason instanceof Error ? reason.message : String(reason),
                    );
                    setStatus("Directory scan failed.");
                    setScanningDirectory(false);
                  })
                }
              >
                {scanningDirectory
                  ? "Scanning selected directory…"
                  : "Choose legacy data or pack directory"}
              </button>
            ) : (
              <p className="profile-warning">
                Directory selection is unavailable in this browser. Use the
                Import file control above; it supports the same portable pack
                and rules XML formats.
              </p>
            )}
            {directorySources.length === 0 ? null : (
              <div className="directory-source-picker">
                <label>
                  Discovered source
                  <select
                    value={selectedSourcePath}
                    disabled={importing}
                    onChange={(event) =>
                      setSelectedSourcePath(event.currentTarget.value)
                    }
                  >
                    {directorySources.map((source) => (
                      <option
                        key={source.relativePath}
                        value={source.relativePath}
                      >
                        {source.relativePath} — {source.kind}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={importing || selectedSourcePath.length === 0}
                  onClick={() =>
                    void importDiscoveredSource().catch((reason: unknown) => {
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : String(reason),
                      );
                      setStatus("Import failed.");
                      setImporting(false);
                    })
                  }
                >
                  Install selected source
                </button>
              </div>
            )}
            <p className="field-help">
              Legacy encrypted containers and loose `.part` files are not
              decrypted or merged by the public web app. Use the project-local
              content tool to create a private `.4ecp` first; this avoids
              persisting decryption keys or update metadata in the browser.
            </p>
          </section>

          <section className="panel storage-diagnostics">
            <div>
              <p className="eyebrow">Browser storage</p>
              <h3>Persistence and quota</h3>
              <p>
                Characters, cached administrator packs, and personal packs live
                in this browser profile. Personal packs are never uploaded.
                Persistent storage reduces automatic eviction risk; backups
                remain the recovery path for device or browser loss.
              </p>
            </div>
            {storageStatus === undefined ? (
              <p>Checking browser storage…</p>
            ) : !storageStatus.supported ? (
              <p className="profile-warning">
                This browser does not expose storage quota diagnostics.
              </p>
            ) : (
              <>
                <dl className="report-facts">
                  <div>
                    <dt>Persistence</dt>
                    <dd>
                      {storageStatus.persisted === true
                        ? "Granted"
                        : storageStatus.persisted === false
                          ? "Not granted"
                          : "Unavailable"}
                    </dd>
                  </div>
                  <div>
                    <dt>Used</dt>
                    <dd>{formatBytes(storageStatus.usage)}</dd>
                  </div>
                  <div>
                    <dt>Quota</dt>
                    <dd>{formatBytes(storageStatus.quota)}</dd>
                  </div>
                  <div>
                    <dt>Quota used</dt>
                    <dd>
                      {storageStatus.usage === undefined ||
                      storageStatus.quota === undefined ||
                      storageStatus.quota === 0
                        ? "Unavailable"
                        : `${((storageStatus.usage / storageStatus.quota) * 100).toFixed(1)}%`}
                    </dd>
                  </div>
                </dl>
                <button
                  type="button"
                  disabled={
                    !storageStatus.persistenceSupported ||
                    storageStatus.persisted === true ||
                    requestingPersistence
                  }
                  onClick={() =>
                    void requestPersistence().catch((reason: unknown) =>
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : String(reason),
                      ),
                    )
                  }
                >
                  {storageStatus.persisted === true
                    ? "Persistent storage granted"
                    : requestingPersistence
                      ? "Requesting…"
                      : "Request persistent storage"}
                </button>
              </>
            )}
          </section>
        </div>
      </details>
    </main>
  );
}
