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
  MAX_CONTENT_PACK_ENCODED_BYTES,
  type ContentPackManifest,
} from "@4ecb/content-pack";

import type {
  ContentImportRequest,
  ImportPackProgressPhase,
  ImportPackResponse,
} from "./worker-messages";
import {
  readPersistenceStatus,
  requestPersistentStorage,
  type PersistenceStatus,
} from "./browser-persistence";
import { downloadCharacterBackup } from "./download";
import type { ContentDownloadState } from "./App";
import { Icon } from "./Icon";
import type { PaperSize } from "./paper-size";
import { SegmentedControl } from "./SegmentedControl";
import { ToastRegion, useToasts } from "./Toasts";
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
import type { AdvertisedContentPack } from "./runtime-content";
import type { ThemePreference } from "./theme";
import {
  DEFAULT_PRINT_CARD_TEXT_SIZE,
  MAX_PRINT_CARD_TEXT_SIZE,
  MIN_PRINT_CARD_TEXT_SIZE,
} from "./print-card-fit";

const repository = new ContentPackRepository();
const characterRepository = new CharacterRepository();

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
  readonly showEntitySource: boolean;
  readonly onShowEntitySourceChange: (showEntitySource: boolean) => void;
  readonly countCoinWeight: boolean;
  readonly onCountCoinWeightChange: (value: boolean) => void;
  readonly mergeFunds: boolean;
  readonly onMergeFundsChange: (value: boolean) => void;
  readonly resolveAbilityChoices: boolean;
  readonly onResolveAbilityChoicesChange: (value: boolean) => void;
  readonly abbreviateAbilityValues: boolean;
  readonly onAbbreviateAbilityValuesChange: (value: boolean) => void;
  readonly printCardTextSize: number;
  readonly onPrintCardTextSizeChange: (value: number) => void;
  readonly paperSize: PaperSize;
  /** The page Settings was opened from (default: the library). */
  readonly closeHref?: string;
  readonly onPaperSizeChange: (value: PaperSize) => void;
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
  showEntitySource,
  onShowEntitySourceChange,
  countCoinWeight,
  onCountCoinWeightChange,
  mergeFunds,
  onMergeFundsChange,
  resolveAbilityChoices,
  onResolveAbilityChoicesChange,
  abbreviateAbilityValues,
  onAbbreviateAbilityValuesChange,
  printCardTextSize,
  onPrintCardTextSizeChange,
  paperSize,
  onPaperSizeChange,
  closeHref = "#/characters",
}: SettingsPageProps) {
  // Ongoing work (an import, a content switch), shown beside its controls.
  // Finished work shows in the page itself; failures and warnings are toasts.
  const [progress, setProgress] = useState<string>();
  const [announcement, setAnnouncement] = useState("");
  const toasts = useToasts();
  const pushToast = toasts.push;
  const [pendingBackup, setPendingBackup] = useState<{
    readonly value: unknown;
    readonly inspection: CharacterBackupInspection;
  }>();
  const [importing, setImporting] = useState(false);
  const [storageStatus, setStorageStatus] = useState<PersistenceStatus>();
  const [requestingPersistence, setRequestingPersistence] = useState(false);
  const [savedOrder, setSavedOrder] = useState<readonly string[]>(readOrder);
  const [applying, setApplying] = useState(false);
  const [dragging, setDragging] = useState<number>();
  const [dropTarget, setDropTarget] = useState<number>();
  const [pendingRemove, setPendingRemove] = useState<{
    readonly row: ContentRow;
    readonly characters: number;
  }>();
  const workerRef = useRef<Worker | undefined>(undefined);
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
    void readPersistenceStatus()
      .then(setStorageStatus)
      .catch(() => setStorageStatus({ supported: false, persisted: false }));
    return () => workerRef.current?.terminate();
  }, []);

  function showError(reason: unknown, title = "Something went wrong"): void {
    pushToast({
      tone: "error",
      title,
      messages: [reason instanceof Error ? reason.message : String(reason)],
    });
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

  /** Saves the table and, when the packs in use change, switches to them. */
  async function apply(next: readonly ContentRow[]): Promise<void> {
    rememberOrder(next);
    const layers = enabledLayers(next);
    if (sameProfileLayers(layers, activeProfile?.layers ?? [])) return;
    setApplying(true);
    setProgress("Switching content…");
    try {
      if (layers.length === 0) await repository.deactivate();
      else
        await repository.activateProfile(
          ACTIVE_PROFILE_ID,
          ACTIVE_PROFILE_NAME,
          layers.map(({ packId }) => packId),
        );
      await onChanged();
    } catch (reason: unknown) {
      showError(reason, "Couldn't switch content");
    } finally {
      setApplying(false);
      setProgress(undefined);
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
      await apply([...others, row]);
      return;
    }
    await apply(replaceRow(others, replacing, row));
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
    void apply(next);
  }

  async function requestPersistence(): Promise<void> {
    setRequestingPersistence(true);
    try {
      const persisted = await requestPersistentStorage();
      setStorageStatus(await readPersistenceStatus());
      if (!persisted)
        pushToast({
          tone: "warning",
          title: "Your browser won't promise to keep your data",
          messages: [
            "Back up your characters now and then so you can restore them if the browser clears them.",
          ],
        });
    } finally {
      setRequestingPersistence(false);
    }
  }

  async function importFile(file: File, replacing?: ContentRow): Promise<void> {
    if (file.size > MAX_CONTENT_PACK_ENCODED_BYTES) {
      throw new Error("The content pack is larger than the 128 MiB limit.");
    }
    workerRef.current?.terminate();
    const worker = new Worker(new URL("./content.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    setImporting(true);
    setProgress(`Reading ${file.name}…`);

    worker.onmessage = (event: MessageEvent<ImportPackResponse>) => {
      const response = event.data;
      if (response.type === "progress") {
        setProgress(phaseLabel(response.phase));
        return;
      }
      setImporting(false);
      setProgress(undefined);
      worker.terminate();
      workerRef.current = undefined;
      if (response.type === "complete") {
        void added(response.manifest, replacing).catch((reason: unknown) =>
          showError(reason, `Couldn't add ${response.manifest.name}`),
        );
      } else {
        showError(response.message, `Couldn't import ${file.name}`);
      }
    };
    worker.onerror = (event) => {
      showError(event.message, `Couldn't import ${file.name}`);
      setImporting(false);
      setProgress(undefined);
      worker.terminate();
      workerRef.current = undefined;
    };

    const buffer = await file.arrayBuffer();
    const request: ContentImportRequest = { type: "import-pack", buffer };
    worker.postMessage(request, [buffer]);
  }

  function cancelImport(): void {
    workerRef.current?.terminate();
    workerRef.current = undefined;
    setImporting(false);
    setProgress(undefined);
  }

  function startFileImport(file: File, replacing?: ContentRow): void {
    if (!file.name.trim().toLocaleLowerCase().endsWith(".4ecp")) {
      showError(
        "Choose a .4ecp content pack. Other formats are converted with the content tool first.",
        `Couldn't import ${file.name}`,
      );
      return;
    }
    void importFile(file, replacing).catch((reason: unknown) => {
      showError(reason, `Couldn't import ${file.name}`);
      setImporting(false);
      setProgress(undefined);
    });
  }

  async function inspectBackupFile(file: File): Promise<void> {
    if (file.size > 100 * 1024 * 1024)
      throw new Error("Backup exceeds the 100 MiB inspection limit");
    const value: unknown = JSON.parse(await file.text());
    const inspection = await characterRepository.inspectBackup(value);
    setPendingBackup({ value, inspection });
  }

  async function restoreInspectedBackup(): Promise<void> {
    if (pendingBackup === undefined) return;
    await characterRepository.restoreBackup(pendingBackup.value);
    setPendingBackup(undefined);
  }

  // Esc closes Settings, unless something on the page handles it first: an
  // open dialog, a field or select, an inline confirmation, or an import.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("dialog[open]") !== null) return;
      const target = event.target;
      if (
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLInputElement &&
          !["checkbox", "radio", "range", "file", "button"].includes(
            target.type,
          ))
      )
        return;
      if (pendingRemove !== undefined) {
        setPendingRemove(undefined);
        return;
      }
      if (pendingBackup !== undefined) {
        setPendingBackup(undefined);
        return;
      }
      if (importing) return;
      window.location.hash = closeHref;
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeHref, importing, pendingBackup, pendingRemove]);

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
            href={closeHref}
            title="Close settings"
          >
            <Icon name="remove" />
          </a>
        </div>
      </header>

      <div className="settings-columns">
        <div className="settings-column">
          <section className="panel settings-section">
            <div>
              <h3>Display</h3>
              <p>How the app looks in this browser.</p>
            </div>
            <SegmentedControl
              label="Color theme"
              options={[
                ["system", "System"],
                ["light", "Light"],
                ["dark", "Dark"],
              ]}
              value={theme}
              onChange={onThemeChange}
            />
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
                checked={showEntitySource}
                onChange={onShowEntitySourceChange}
                label="Show entity source"
                help="Name the sourcebook in a line at the bottom of each card in the builder, Equipment, and Shop."
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
              <h3>Power cards</h3>
              <p>Options for power cards everywhere, on screen and printed.</p>
            </div>
            <div className="settings-options">
              <CheckboxSetting
                checked={resolveAbilityChoices}
                onChange={onResolveAbilityChoicesChange}
                label="Use the best ability in power descriptions"
                help="When a power lets you choose an ability, show only the one with the highest modifier. Ties go to the higher score, then your class's key abilities, then the power's first option."
              />
            </div>
          </section>
        </div>
        <div className="settings-column">
          <section className="panel settings-section">
            <div>
              <h3>Printed sheet</h3>
              <p>Options for the printable character sheet and its cards.</p>
            </div>
            <div className="settings-options">
              <SegmentedControl
                label="Paper size"
                options={[
                  ["letter", "Letter"],
                  ["a4", "A4"],
                ]}
                value={paperSize}
                onChange={onPaperSizeChange}
              />
              <CheckboxSetting
                checked={countCoinWeight}
                onChange={onCountCoinWeightChange}
                label="Count coin weight"
                help="Include carried coins in encumbrance. Turn this off if your group ignores coin weight. Stored coins never count."
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
                      onPrintCardTextSizeChange(
                        Number(event.currentTarget.value),
                      )
                    }
                  />
                  <span aria-hidden="true">Larger</span>
                  <button
                    type="button"
                    className="settings-slider-reset"
                    disabled={
                      printCardTextSize === DEFAULT_PRINT_CARD_TEXT_SIZE
                    }
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
            {storageStatus === undefined ? null : (
              <p className="field-help settings-persistence">
                {storageStatus.persisted
                  ? "This browser has promised to keep your data. Backups are still recommended."
                  : "This browser may clear saved data to free up space. Backups are the reliable way to recover."}
                {storageStatus.supported && !storageStatus.persisted ? (
                  <button
                    type="button"
                    disabled={requestingPersistence}
                    onClick={() =>
                      void requestPersistence().catch((reason: unknown) =>
                        showError(reason, "Couldn't ask the browser"),
                      )
                    }
                  >
                    Keep data in this browser
                  </button>
                ) : null}
              </p>
            )}
            <div className="heading-actions">
              <button
                type="button"
                onClick={() =>
                  void downloadCharacterBackup(characterRepository).catch(
                    (reason: unknown) =>
                      showError(reason, "Couldn't back up your characters"),
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
                        showError(reason, `Couldn't read ${file.name}`),
                      );
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            {pendingBackup === undefined ? null : (
              <div
                className="backup-preview"
                aria-label="Backup restore preview"
              >
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
                    structurally valid, but payload integrity cannot be
                    verified.
                  </p>
                ) : null}
                <div className="inline-actions">
                  <button
                    type="button"
                    onClick={() =>
                      void restoreInspectedBackup().catch((reason: unknown) =>
                        showError(reason, "Couldn't restore the backup"),
                      )
                    }
                  >
                    Restore {pendingBackup.inspection.characterCount}{" "}
                    {pendingBackup.inspection.characterCount === 1
                      ? "character"
                      : "characters"}
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
              When two packs include the same entry, the lower row wins. Drag
              rows to change the order.
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
                Couldn&apos;t download{" "}
                {advertised.name ?? "your group's content"}
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
              No content yet. Import a content pack to start building
              characters.
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
                          dragging === index
                            ? "content-row-dragging"
                            : undefined,
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
                                void apply(moveRow(rows, index, to));
                                // Keyboard moves aren't visible to screen
                                // readers, so they are announced.
                                setAnnouncement(
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
            {progress === undefined ? null : (
              <p className="status" aria-live="polite">
                {progress}
              </p>
            )}
          </div>
          <p className="field-help">
            Turning content on or off, reordering, or replacing it doesn&apos;t
            change existing characters: each keeps its content until you open it
            and choose to update.
          </p>
        </section>
      </div>

      <p aria-live="polite" className="visually-hidden">
        {announcement}
      </p>
      <ToastRegion toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </main>
  );
}
