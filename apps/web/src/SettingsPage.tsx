import { useEffect, useRef, useState } from "react";

import { ContentPackRepository } from "@4ecb/browser-storage";
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

const repository = new ContentPackRepository();

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
  readonly manifests: readonly ContentPackManifest[];
  readonly activePackId?: string;
  readonly onChanged: () => Promise<void>;
}

export function SettingsPage({
  manifests,
  activePackId,
  onChanged,
}: SettingsPageProps) {
  const [status, setStatus] = useState(
    manifests.length === 0 ? "No content packs installed." : "Ready.",
  );
  const [error, setError] = useState<string>();
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
  const workerRef = useRef<Worker | undefined>(undefined);
  const directoryPickerSupported = supportsDirectoryPicker(window);

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

  return (
    <main className="settings-page" id="main-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Local data</p>
          <h2>Content profiles</h2>
          <p>
            Packs stay in this browser. Activating one selects the corpus used
            by the compendium and, later, character building.
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

      <section className="panel content-onboarding">
        <div>
          <p className="eyebrow">Bring your own data</p>
          <h3>Install a content source</h3>
          <p>
            Import a portable `.4ecp` pack, or compile a decrypted/merged
            `.dnd40.xml` rules file locally in this browser. Source files are
            read only after you choose them and are never uploaded.
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
            Characters and private packs live only in this browser profile.
            Persistent storage reduces automatic eviction risk; backups remain
            the recovery path for device or browser loss.
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

      {manifests.length === 0 ? (
        <div className="empty-state">
          <h3>No content installed</h3>
          <p>
            Build the synthetic fixture or your private rules data with the
            content tool, then import the resulting `.4ecp` file.
          </p>
          <code>bash scripts/build-private-content.sh</code>
        </div>
      ) : (
        <ul className="profile-grid">
          {manifests.map((manifest) => {
            const active = manifest.packId === activePackId;
            return (
              <li
                key={manifest.packId}
                className={active ? "active-profile" : undefined}
              >
                <div>
                  <p className="eyebrow">
                    {active ? "Active profile" : "Installed"}
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
                    <dd>{manifest.contentDigest.slice(0, 16)}</dd>
                  </div>
                </dl>
                <div className="profile-actions">
                  {active ? (
                    <button
                      type="button"
                      onClick={() =>
                        void repository.deactivate().then(onChanged)
                      }
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        void repository
                          .activate(manifest.packId)
                          .then(onChanged)
                      }
                    >
                      Activate
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      void repository.remove(manifest.packId).then(onChanged)
                    }
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
