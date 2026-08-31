import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ContentPackRepository } from "@4ecb/browser-storage";
import type { ContentEntity } from "@4ecb/content-domain";
import type { ContentPack, ContentPackManifest } from "@4ecb/content-pack";

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

function EntityDetail({
  entity,
}: {
  readonly entity: ContentEntity | undefined;
}) {
  if (entity === undefined) {
    return (
      <p className="empty-state">
        Select an entry to inspect its normalized fields.
      </p>
    );
  }
  return (
    <article className="entity-detail" aria-labelledby="entity-heading">
      <header>
        <p className="eyebrow">{entity.type}</p>
        <h2 id="entity-heading">{entity.name}</h2>
        <p className="identifier">{entity.id}</p>
      </header>
      <dl className="facts">
        <div>
          <dt>Source</dt>
          <dd>{entity.source || "Not specified"}</dd>
        </div>
        <div>
          <dt>Categories</dt>
          <dd>{entity.categories.join(", ") || "None"}</dd>
        </div>
        <div>
          <dt>Specific fields</dt>
          <dd>{entity.specifics.length}</dd>
        </div>
        <div>
          <dt>Rule statements</dt>
          <dd>{entity.rules.length}</dd>
        </div>
      </dl>
      {entity.flavor === undefined ? null : (
        <section>
          <h3>Flavor</h3>
          <p>{entity.flavor}</p>
        </section>
      )}
      {entity.description.length === 0 ? null : (
        <section>
          <h3>Description</h3>
          <p className="preserve-lines">{entity.description}</p>
        </section>
      )}
      {entity.specifics.length === 0 ? null : (
        <section>
          <h3>Fields</h3>
          <dl className="field-list">
            {entity.specifics.map((field) => (
              <div key={`${field.ordinal}-${field.name}`}>
                <dt>{field.name || "Unnamed field"}</dt>
                <dd className="preserve-lines">{field.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </article>
  );
}

export function App() {
  const [manifests, setManifests] = useState<ContentPackManifest[]>([]);
  const [activePackId, setActivePackId] = useState<string>();
  const [selectedPackId, setSelectedPackId] = useState<string>();
  const [selectedPack, setSelectedPack] = useState<ContentPack>();
  const [selectedEntityId, setSelectedEntityId] = useState<string>();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Loading local content packs…");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string>();
  const workerRef = useRef<Worker | undefined>(undefined);

  const refresh = useCallback(async () => {
    const [installed, active] = await Promise.all([
      repository.list(),
      repository.activePackId(),
    ]);
    setManifests(installed);
    setActivePackId(active);
    setStatus(
      installed.length === 0 ? "No content packs installed." : "Ready.",
    );
    setSelectedPackId((current) => {
      if (
        current !== undefined &&
        !installed.some((pack) => pack.packId === current)
      ) {
        setSelectedPack(undefined);
        return undefined;
      }
      return current;
    });
  }, []);

  useEffect(() => {
    void refresh().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => workerRef.current?.terminate();
  }, [refresh]);

  useEffect(() => {
    if (selectedPackId === undefined) {
      setSelectedPack(undefined);
      return;
    }
    void repository
      .get(selectedPackId)
      .then(setSelectedPack)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      });
  }, [selectedPackId]);

  const visibleEntities = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (selectedPack === undefined) return [];
    if (normalized.length === 0) return selectedPack.entities.slice(0, 250);
    return selectedPack.entities
      .filter((entity) =>
        [entity.name, entity.type, entity.id, entity.source].some((value) =>
          value.toLocaleLowerCase().includes(normalized),
        ),
      )
      .slice(0, 250);
  }, [query, selectedPack]);

  const selectedEntity = selectedPack?.entities.find(
    (entity) => entity.id === selectedEntityId,
  );

  async function importFile(file: File): Promise<void> {
    if (file.size > MAX_IMPORT_BYTES)
      throw new Error("Pack exceeds the 512 MiB import limit");
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
      } else if (response.type === "complete") {
        setSelectedPackId(response.manifest.packId);
        setImporting(false);
        worker.terminate();
        workerRef.current = undefined;
        void refresh().then(() => {
          setStatus(`Installed ${response.manifest.name}.`);
        });
      } else {
        setError(response.message);
        setStatus("Import failed.");
        setImporting(false);
        worker.terminate();
        workerRef.current = undefined;
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
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Foundation build</p>
          <h1>4E Character Builder</h1>
        </div>
        <p className="unofficial">
          Unofficial fan project. Bring your own legally obtained data.
        </p>
      </header>

      <nav className="primary-nav" aria-label="Primary navigation">
        <a aria-current="page" href="#content">
          Content packs
        </a>
        <span aria-disabled="true">Compendium</span>
        <span aria-disabled="true">Characters</span>
      </nav>

      <main id="content" className="workspace">
        <aside className="pack-panel" aria-labelledby="packs-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Local library</p>
              <h2 id="packs-heading">Content packs</h2>
            </div>
            <label className="file-button">
              Import pack
              <input
                accept=".4ecp,application/json"
                type="file"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file !== undefined) {
                    void importFile(file).catch((reason: unknown) => {
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : String(reason),
                      );
                      setStatus("Import failed.");
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
              <p>
                Compile the synthetic fixture or your private rules data with
                the content tool.
              </p>
              <code>pnpm content-tool build …</code>
            </div>
          ) : (
            <ul className="pack-list">
              {manifests.map((manifest) => (
                <li key={manifest.packId}>
                  <button
                    className={
                      selectedPackId === manifest.packId
                        ? "selected"
                        : undefined
                    }
                    type="button"
                    onClick={() => {
                      setSelectedPackId(manifest.packId);
                      setSelectedEntityId(undefined);
                    }}
                  >
                    <strong>{manifest.name}</strong>
                    <span>{manifest.recordCount.toLocaleString()} records</span>
                    <span>{manifest.contentDigest.slice(0, 12)}</span>
                  </button>
                  <div className="pack-actions">
                    {activePackId === manifest.packId ? (
                      <button
                        type="button"
                        onClick={() =>
                          void repository.deactivate().then(refresh)
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
                            .then(refresh)
                        }
                      >
                        Activate
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        void repository.remove(manifest.packId).then(refresh)
                      }
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="content-panel" aria-label="Pack contents">
          {selectedPack === undefined ? (
            <p className="empty-state">
              Import or select a content pack to inspect it.
            </p>
          ) : (
            <>
              <header className="content-toolbar">
                <div>
                  <p className="eyebrow">{selectedPack.manifest.packId}</p>
                  <h2>{selectedPack.manifest.name}</h2>
                </div>
                <label>
                  Filter this pack
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                  />
                </label>
              </header>
              <div className="content-columns">
                <div>
                  <p className="result-count">
                    Showing {visibleEntities.length.toLocaleString()} of{" "}
                    {selectedPack.entities.length.toLocaleString()} records
                  </p>
                  <ul className="entity-list">
                    {visibleEntities.map((entity) => (
                      <li key={entity.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedEntityId(entity.id)}
                        >
                          <strong>{entity.name}</strong>
                          <span>{entity.type}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <EntityDetail entity={selectedEntity} />
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
