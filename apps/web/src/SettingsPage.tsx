import { useEffect, useRef, useState } from "react";

import {
  CharacterRepository,
  ContentPackRepository,
  type CharacterBackupInspection,
  type ContentProfileDefinition,
  type ContentProfileLayer,
  type InstalledContentPack,
} from "@4ecb/browser-storage";
import {
  contentPackIdentityErrors,
  MAX_CONTENT_PACK_ENCODED_BYTES,
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
import {
  buildProfileLayerViews,
  movePersonalLayer,
  sameProfileLayers,
} from "./content-profile-ui";
import type { AdvertisedContentPack } from "./runtime-content";
import type { ThemePreference } from "./theme";

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
  const [draftLayers, setDraftLayers] = useState<ContentProfileLayer[]>([]);
  const [selectedPersonalPackId, setSelectedPersonalPackId] = useState("");
  const [preview, setPreview] =
    useState<Awaited<ReturnType<ContentPackRepository["previewProfile"]>>>();
  const [previewing, setPreviewing] = useState(false);
  const [activating, setActivating] = useState(false);
  const workerRef = useRef<Worker | undefined>(undefined);
  const directoryPickerSupported = supportsDirectoryPicker(window);
  const serverPackIds = new Set(advertisedPacks.map(({ packId }) => packId));
  const serverLayers = advertisedPacks.map(({ packId, contentDigest }) => ({
    packId,
    contentDigest,
  }));
  const personalPacks = installedPacks.filter(
    ({ manifest, origin }) =>
      origin === "personal" && !serverPackIds.has(manifest.packId),
  );
  const selectablePersonalPacks = personalPacks.filter(
    ({ manifest }) =>
      !draftLayers.some(({ packId }) => packId === manifest.packId),
  );
  const activeLayers = activeProfile?.layers ?? [];
  const draftViews = buildProfileLayerViews(
    draftLayers,
    installedPacks,
    serverPackIds,
  );
  const draftAvailable = draftViews.every(({ available }) => available);
  const draftMatchesActive = sameProfileLayers(draftLayers, activeLayers);

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

  useEffect(() => {
    const personalActiveLayers = activeLayers.filter(
      ({ packId, contentDigest }) =>
        !serverPackIds.has(packId) &&
        installedPacks.some(
          ({ manifest, origin }) =>
            origin === "personal" &&
            manifest.packId === packId &&
            manifest.contentDigest === contentDigest,
        ),
    );
    setDraftLayers([...serverLayers, ...personalActiveLayers]);
    setPreview(undefined);
  }, [
    activeProfile?.contentDigest,
    advertisedPacks
      .map(({ packId, contentDigest }) => `${packId}:${contentDigest}`)
      .join("|"),
  ]);

  function updateDraft(layers: readonly ContentProfileLayer[]): void {
    setDraftLayers([...layers]);
    setPreview(undefined);
  }

  async function previewDraft(): Promise<void> {
    setPreviewing(true);
    setError(undefined);
    try {
      const result = await repository.previewProfile(
        "browser-active-profile",
        "Active browser content profile",
        draftLayers.map(({ packId }) => packId),
      );
      setPreview(result);
      setStatus(
        `Preview ready: ${result.collisions.length.toLocaleString()} overridden record${result.collisions.length === 1 ? "" : "s"}. Review it before activation.`,
      );
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStatus("Profile preview failed.");
    } finally {
      setPreviewing(false);
    }
  }

  async function activatePreview(): Promise<void> {
    if (preview === undefined) return;
    setActivating(true);
    setError(undefined);
    try {
      await repository.activateProfile(
        "browser-active-profile",
        "Active browser content profile",
        draftLayers.map(({ packId }) => packId),
      );
      await onChanged();
      setPreview(undefined);
      setStatus(
        "Content profile activated. Existing characters remain on their pinned revisions until you preview and adopt a migration from Characters.",
      );
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStatus("Profile activation failed.");
    } finally {
      setActivating(false);
    }
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
    const started = performance.now();
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
        void onChanged().then(() => {
          const elapsedSeconds = (performance.now() - started) / 1000;
          setStatus(
            `Installed ${response.manifest.name} in ${elapsedSeconds.toFixed(1)} seconds.`,
          );
        });
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

  return (
    <main className="settings-page" id="main-content">
      <header className="page-heading">
        <div>
          <h2>Settings</h2>
        </div>
      </header>

      <section className="panel settings-section">
        <div>
          <h3>Display</h3>
          <p>Choose a color theme for this browser.</p>
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
        <label>
          <input
            type="checkbox"
            checked={hideFlavortext}
            onChange={(event) =>
              onHideFlavortextChange(event.currentTarget.checked)
            }
          />{" "}
          Hide flavortext
        </label>
      </section>

      <section className="panel settings-section">
        <div>
          <h3>Character library</h3>
          <p>Back up or restore all characters stored in this browser.</p>
        </div>
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
              accept=".json,application/json"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file !== undefined)
                  void inspectBackupFile(file).catch((reason: unknown) =>
                    setLibraryError(
                      reason instanceof Error ? reason.message : String(reason),
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
                This older backup has no checksum. Its records are structurally
                valid, but payload integrity cannot be verified.
              </p>
            ) : null}
            <div className="inline-actions">
              <button
                type="button"
                onClick={() =>
                  void restoreInspectedBackup().catch((reason: unknown) =>
                    setLibraryError(
                      reason instanceof Error ? reason.message : String(reason),
                    ),
                  )
                }
              >
                Restore {pendingBackup.inspection.characterCount} record(s)
              </button>
              <button type="button" onClick={() => setPendingBackup(undefined)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <header className="settings-subheading">
        <div>
          <p className="eyebrow">Shared baseline + personal overlays</p>
          <h3>Content</h3>
          <p>
            This server can distribute a shared baseline. You can layer personal
            packs above it; personal files stay in this browser and are never
            uploaded.
          </p>
        </div>
        <div className="heading-actions">
          <label className="file-button">
            Import file
            <input
              accept=".4ecp,.xml,application/json,application/xml,text/xml"
              type="file"
              disabled={importing}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file !== undefined) {
                  const kind = classifyContentSource(file.name);
                  if (kind === undefined) {
                    setError(
                      "Choose a .4ecp pack or a decrypted/merged .dnd40 XML file.",
                    );
                    setStatus("Import not started.");
                  } else {
                    void importFile(file, kind).catch((reason: unknown) => {
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : String(reason),
                      );
                      setStatus("Import failed.");
                      setImporting(false);
                    });
                  }
                }
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
      </header>

      <p className="status" aria-live="polite">
        {status}
      </p>
      {error === undefined ? null : (
        <div className="error" role="alert">
          <strong>Problem</strong>
          <span>{error}</span>
        </div>
      )}

      <section className="panel administrator-content">
        <div>
          <p className="eyebrow">Shared by this server</p>
          <h3>Administrator-provided baseline</h3>
          <p>
            These packs are published by the server administrator and are
            available to everyone who can access this deployment. They form a
            fixed base in the order shown; personal content can be layered above
            them.
          </p>
        </div>
        {runtimeContentError === undefined ? null : (
          <div className="error" role="alert">
            <strong>Administrator content is unavailable</strong>
            <span>{runtimeContentError}</span>
          </div>
        )}
        {advertisedPacks.length === 0 ? (
          <p className="profile-warning">
            This server does not advertise a shared content baseline. You can
            still import and activate a personal pack below.
          </p>
        ) : (
          <ol className="server-pack-list" aria-live="polite">
            {advertisedPacks.map((advertised, index) => {
              const installed = installedPacks.some(
                ({ manifest }) =>
                  manifest.packId === advertised.packId &&
                  manifest.contentDigest === advertised.contentDigest,
              );
              const download = contentDownloads[advertised.packId];
              const failed = download?.phase === "error";
              return (
                <li key={`${advertised.packId}:${advertised.contentDigest}`}>
                  <div>
                    <p className="eyebrow">Baseline layer {index + 1}</p>
                    <h4>{advertised.name ?? advertised.packId}</h4>
                    <p className="identifier">{advertised.packId}</p>
                  </div>
                  <dl className="profile-facts">
                    <div>
                      <dt>Availability</dt>
                      <dd>
                        {installed
                          ? "Installed"
                          : download?.phase === "downloading"
                            ? "Downloading"
                            : download?.phase === "installing"
                              ? "Verifying and installing"
                              : failed
                                ? "Unavailable"
                                : "Waiting to download"}
                      </dd>
                    </div>
                    <div className="digest-fact">
                      <dt>Expected digest</dt>
                      <dd>
                        <code>{advertised.contentDigest}</code>
                      </dd>
                    </div>
                  </dl>
                  {download?.phase === "downloading" ? (
                    <div className="download-progress">
                      {download.totalBytes === undefined ? null : (
                        <progress
                          aria-label={`Downloading ${advertised.name ?? advertised.packId}`}
                          max={download.totalBytes}
                          value={download.receivedBytes ?? 0}
                        />
                      )}
                      <span>
                        {formatBytes(download.receivedBytes)}
                        {download.totalBytes === undefined
                          ? " downloaded"
                          : ` of ${formatBytes(download.totalBytes)}`}
                      </span>
                    </div>
                  ) : null}
                  {failed ? (
                    <div className="profile-availability-error" role="alert">
                      <strong>Pack unavailable</strong>
                      <span>{download.error}</span>
                    </div>
                  ) : null}
                  {failed ? (
                    <button
                      type="button"
                      onClick={() => void onRetryAdvertised(advertised)}
                    >
                      Retry download
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="panel profile-composer">
        <div className="profile-composer-heading">
          <div>
            <p className="eyebrow">Ordered resolution</p>
            <h3>Active profile composition</h3>
            <p>
              Later personal layers override earlier records. Administrator
              layers stay first and cannot be reordered. Changing this draft
              does nothing until you preview and activate it.
            </p>
          </div>
          {activeProfile === undefined ? (
            <p className="profile-state">No layered profile is active.</p>
          ) : (
            <dl className="active-profile-summary">
              <div>
                <dt>Active resolved digest</dt>
                <dd>
                  <code>{activeProfile.contentDigest}</code>
                </dd>
              </div>
              <div>
                <dt>Resolution</dt>
                <dd>{activeProfile.resolutionPolicy}</dd>
              </div>
            </dl>
          )}
        </div>

        {draftViews.length === 0 ? (
          <div className="empty-state">
            <h4>This profile has no layers</h4>
            <p>
              Import a personal pack, then add it here to keep using the
              single-pack workflow on a server without a shared baseline.
            </p>
          </div>
        ) : (
          <ol className="profile-layer-list">
            {draftViews.map((layer, index) => {
              const personal = layer.origin === "personal";
              const personalIndex = index - serverLayers.length;
              return (
                <li
                  key={`${layer.packId}:${layer.contentDigest}`}
                  className={layer.available ? undefined : "missing-layer"}
                >
                  <div className="layer-order" aria-hidden="true">
                    {index + 1}
                  </div>
                  <div className="layer-description">
                    <p className="eyebrow">
                      {personal ? "Personal overlay" : "Administrator baseline"}
                    </p>
                    <h4>{layer.name}</h4>
                    <p className="identifier">{layer.packId}</p>
                    <p className="layer-digest">
                      Digest <code>{layer.contentDigest}</code>
                    </p>
                    {!layer.available ? (
                      <p className="profile-availability-error" role="alert">
                        This exact pack revision is not available in browser
                        storage.
                      </p>
                    ) : null}
                  </div>
                  {personal ? (
                    <div
                      className="layer-actions"
                      role="group"
                      aria-label={`Reorder ${layer.name}`}
                    >
                      <button
                        type="button"
                        disabled={personalIndex === 0}
                        onClick={() =>
                          updateDraft(
                            movePersonalLayer(
                              draftLayers,
                              index,
                              -1,
                              serverLayers.length,
                            ),
                          )
                        }
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        disabled={index === draftLayers.length - 1}
                        onClick={() =>
                          updateDraft(
                            movePersonalLayer(
                              draftLayers,
                              index,
                              1,
                              serverLayers.length,
                            ),
                          )
                        }
                      >
                        Move down
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateDraft(
                            draftLayers.filter(
                              (_, layerIndex) => layerIndex !== index,
                            ),
                          )
                        }
                      >
                        Remove from draft
                      </button>
                    </div>
                  ) : (
                    <p className="fixed-layer">Fixed by administrator</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <div className="add-overlay-control">
          <label>
            Add a personal overlay
            <select
              value={selectedPersonalPackId}
              disabled={selectablePersonalPacks.length === 0}
              onChange={(event) =>
                setSelectedPersonalPackId(event.currentTarget.value)
              }
            >
              <option value="">
                {selectablePersonalPacks.length === 0
                  ? "No additional personal packs installed"
                  : "Choose a personal pack"}
              </option>
              {selectablePersonalPacks.map(({ manifest }) => (
                <option key={manifest.packId} value={manifest.packId}>
                  {manifest.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={selectedPersonalPackId.length === 0}
            onClick={() => {
              const selected = personalPacks.find(
                ({ manifest }) => manifest.packId === selectedPersonalPackId,
              );
              if (selected === undefined) return;
              updateDraft([
                ...draftLayers,
                {
                  packId: selected.manifest.packId,
                  contentDigest: selected.manifest.contentDigest,
                },
              ]);
              setSelectedPersonalPackId("");
            }}
          >
            Add overlay
          </button>
        </div>

        <p className="profile-safety-note">
          Activation changes the Compendium and the profile used for new
          characters. Existing characters stay pinned to their exact profile
          revision; preview and adopt their migrations individually in
          Characters.
        </p>
        <div className="profile-activation-actions">
          <button
            type="button"
            disabled={draftLayers.length === 0 || !draftAvailable || previewing}
            onClick={() => void previewDraft()}
          >
            {previewing ? "Preparing preview…" : "Preview profile"}
          </button>
          {activeProfile === undefined ? null : (
            <button
              type="button"
              onClick={() =>
                void repository
                  .deactivate()
                  .then(onChanged)
                  .then(() => setStatus("Content profile deactivated."))
                  .catch((reason: unknown) => {
                    setError(
                      reason instanceof Error ? reason.message : String(reason),
                    );
                    setStatus("Profile deactivation failed.");
                  })
              }
            >
              Deactivate
            </button>
          )}
        </div>

        {preview === undefined ? null : (
          <div className="profile-preview" aria-live="polite">
            <div>
              <p className="eyebrow">Activation preview</p>
              <h4>Resolved profile is ready</h4>
              <dl className="profile-facts">
                <div>
                  <dt>Layers</dt>
                  <dd>{preview.definition.layers.length}</dd>
                </div>
                <div>
                  <dt>Overridden records</dt>
                  <dd>{preview.collisions.length.toLocaleString()}</dd>
                </div>
                <div className="digest-fact">
                  <dt>Resolved digest</dt>
                  <dd>
                    <code>{preview.definition.contentDigest}</code>
                  </dd>
                </div>
              </dl>
              {preview.collisions.length === 0 ? null : (
                <details>
                  <summary>Review overridden record IDs</summary>
                  <ul className="collision-list">
                    {preview.collisions.slice(0, 50).map((entityId) => (
                      <li key={entityId}>
                        <code>{entityId}</code>
                      </li>
                    ))}
                  </ul>
                  {preview.collisions.length > 50 ? (
                    <p>
                      Showing the first 50 of{" "}
                      {preview.collisions.length.toLocaleString()}.
                    </p>
                  ) : null}
                </details>
              )}
            </div>
            <button
              type="button"
              disabled={activating}
              onClick={() => void activatePreview()}
            >
              {activating ? "Activating…" : "Activate this profile"}
            </button>
          </div>
        )}
        {draftMatchesActive && preview === undefined ? (
          <p className="field-help">
            This draft matches the active ordered profile. You may still preview
            it to review its resolved digest and overrides.
          </p>
        ) : null}
      </section>

      <section className="panel content-onboarding">
        <div>
          <p className="eyebrow">Bring your own data</p>
          <h3>Install a content source</h3>
          <p>
            Import a portable `.4ecp` pack, or compile a decrypted/merged
            `.dnd40.xml` rules file locally in this browser. Source files are
            read only after you choose them. Personal packs stay in this browser
            and are never uploaded or shared with other users.
          </p>
        </div>
        <div className="onboarding-fields">
          <label>
            Local profile ID for rules XML
            <input
              value={localPackId}
              disabled={importing}
              onChange={(event) => setLocalPackId(event.currentTarget.value)}
            />
          </label>
          <label>
            Local profile name for rules XML
            <input
              value={localPackName}
              disabled={importing}
              onChange={(event) => setLocalPackName(event.currentTarget.value)}
            />
          </label>
        </div>
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
            Directory selection is unavailable in this browser. Use the Import
            file control above; it supports the same portable pack and rules XML
            formats.
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
                  <option key={source.relativePath} value={source.relativePath}>
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
                    reason instanceof Error ? reason.message : String(reason),
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
          Legacy encrypted containers and loose `.part` files are not decrypted
          or merged by the public web app. Use the project-local content tool to
          create a private `.4ecp` first; this avoids persisting decryption keys
          or update metadata in the browser.
        </p>
      </section>

      <section className="panel storage-diagnostics">
        <div>
          <p className="eyebrow">Browser storage</p>
          <h3>Persistence and quota</h3>
          <p>
            Characters, cached administrator packs, and personal packs live in
            this browser profile. Personal packs are never uploaded. Persistent
            storage reduces automatic eviction risk; backups remain the recovery
            path for device or browser loss.
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
                    reason instanceof Error ? reason.message : String(reason),
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

      {personalPacks.length === 0 ? (
        <div className="empty-state">
          <h3>No personal content installed</h3>
          <p>
            Import a `.4ecp` or merged rules XML file to add personal content on
            top of the administrator baseline. On a server without a baseline,
            one personal pack can be the complete profile.
          </p>
        </div>
      ) : (
        <section aria-labelledby="personal-content-heading">
          <div className="section-heading">
            <p className="eyebrow">Stored in this browser</p>
            <h3 id="personal-content-heading">Personal packs</h3>
            <p>
              Personal packs are never uploaded to the server and are not shared
              with other users. Add them to the ordered draft above before
              previewing and activating.
            </p>
          </div>
          <ul className="profile-grid">
            {personalPacks.map(({ manifest }) => {
              const inActiveProfile = activeLayers.some(
                ({ packId, contentDigest }) =>
                  packId === manifest.packId &&
                  contentDigest === manifest.contentDigest,
              );
              const inDraft = draftLayers.some(
                ({ packId }) => packId === manifest.packId,
              );
              return (
                <li
                  key={manifest.packId}
                  className={inActiveProfile ? "active-profile" : undefined}
                >
                  <div>
                    <p className="eyebrow">
                      {inActiveProfile ? "In active profile" : "Personal pack"}
                    </p>
                    <h3>{manifest.name}</h3>
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
                    <div>
                      <dt>Digest</dt>
                      <dd>
                        <code>{manifest.contentDigest}</code>
                      </dd>
                    </div>
                  </dl>
                  <div className="profile-actions">
                    <button
                      type="button"
                      disabled={inDraft}
                      onClick={() =>
                        updateDraft([
                          ...draftLayers,
                          {
                            packId: manifest.packId,
                            contentDigest: manifest.contentDigest,
                          },
                        ])
                      }
                    >
                      {inDraft ? "In profile draft" : "Add to profile draft"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setError(undefined);
                        void repository
                          .remove(manifest.packId)
                          .then(onChanged)
                          .then(() => {
                            updateDraft(
                              draftLayers.filter(
                                ({ packId }) => packId !== manifest.packId,
                              ),
                            );
                            setStatus(
                              `Removed ${manifest.name} from this browser.`,
                            );
                          })
                          .catch((reason: unknown) => {
                            setError(
                              reason instanceof Error
                                ? reason.message
                                : String(reason),
                            );
                            setStatus("Pack removal failed.");
                          });
                      }}
                    >
                      Remove from browser
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
