import { useEffect, useRef, useState } from "react";

import { ContentPackRepository } from "@4ecb/browser-storage";
import type { ContentPackManifest } from "@4ecb/content-pack";

import type {
  ImportPackProgressPhase,
  ImportPackRequest,
  ImportPackResponse,
} from "./worker-messages";

const repository = new ContentPackRepository();
const MAX_IMPORT_BYTES = 512 * 1024 * 1024;

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
  const workerRef = useRef<Worker | undefined>(undefined);

  useEffect(() => () => workerRef.current?.terminate(), []);

  async function importFile(file: File): Promise<void> {
    if (file.size > MAX_IMPORT_BYTES) {
      throw new Error("Pack exceeds the 512 MiB import limit");
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
    const request: ImportPackRequest = { type: "import-pack", buffer };
    worker.postMessage(request, [buffer]);
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
            Import pack
            <input
              accept=".4ecp,application/json"
              type="file"
              disabled={importing}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file !== undefined) {
                  void importFile(file).catch((reason: unknown) => {
                    setError(
                      reason instanceof Error ? reason.message : String(reason),
                    );
                    setStatus("Import failed.");
                    setImporting(false);
                  });
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
