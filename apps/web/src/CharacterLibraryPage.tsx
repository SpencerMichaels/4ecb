import { useCallback, useEffect, useState } from "react";

import { CharacterRepository } from "@4ecb/browser-storage";
import {
  newCharacterRecord,
  type CharacterBackup,
  type CharacterRecord,
} from "@4ecb/character-domain";
import type { ContentPackManifest } from "@4ecb/content-pack";
import {
  comparePreservation,
  exportDnd4e,
  importDnd4e,
  type Dnd4eImportReport,
} from "@4ecb/legacy-dnd4e";
import type { ProfileMigrationPreview } from "@4ecb/rules-engine";

import {
  contentProfileRevisionKey,
  previewMatchesTargetRevision,
} from "./profile-migration";
import { RulesWorkerClient } from "./rules-client";

const repository = new CharacterRepository();

function ProfileMigrationControl({
  character,
  manifests,
  onAdopted,
  onError,
}: {
  readonly character: CharacterRecord;
  readonly manifests: readonly ContentPackManifest[];
  readonly onAdopted: (message: string) => Promise<void>;
  readonly onError: (message: string) => void;
}) {
  const [targetPackId, setTargetPackId] = useState(
    character.profileBinding?.packId ?? "",
  );
  const [preview, setPreview] = useState<ProfileMigrationPreview>();
  const [previewRevision, setPreviewRevision] = useState<string>();
  const [previewing, setPreviewing] = useState(false);
  const target = manifests.find((manifest) => manifest.packId === targetPackId);

  async function loadPreview(): Promise<void> {
    if (target === undefined) return;
    const client = new RulesWorkerClient();
    setPreviewing(true);
    setPreview(undefined);
    try {
      const result = await client.previewProfileMigration(
        character.build,
        target.packId,
        character.profileBinding?.packId,
        character.profileBinding?.contentDigest,
      );
      setPreview(result);
      setPreviewRevision(contentProfileRevisionKey(target));
    } finally {
      client.terminate();
      setPreviewing(false);
    }
  }

  async function adopt(): Promise<void> {
    if (
      target === undefined ||
      !previewMatchesTargetRevision(previewRevision, target)
    )
      return;
    await repository.updateMetadata(character.id, {
      profileBinding: {
        packId: target.packId,
        contentDigest: target.contentDigest,
      },
    });
    setPreview(undefined);
    await onAdopted(`Adopted ${target.name} after migration preview.`);
  }

  return (
    <section
      className="profile-migration"
      aria-label="Content profile migration"
    >
      <h4>Content profile</h4>
      <label>
        Migration target
        <select
          value={targetPackId}
          onChange={(event) => {
            setTargetPackId(event.currentTarget.value);
            setPreview(undefined);
            setPreviewRevision(undefined);
          }}
        >
          <option value="">Choose an installed profile</option>
          {manifests.map((manifest) => (
            <option key={manifest.packId} value={manifest.packId}>
              {manifest.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={target === undefined || previewing}
        onClick={() =>
          void loadPreview().catch((reason: unknown) =>
            onError(reason instanceof Error ? reason.message : String(reason)),
          )
        }
      >
        {previewing ? "Evaluating migration…" : "Preview migration"}
      </button>
      {preview === undefined ||
      !previewMatchesTargetRevision(previewRevision, target) ? null : (
        <div className="migration-preview" aria-live="polite">
          {!preview.sourceAvailable ? (
            <p className="profile-warning">
              The exact source profile revision is not installed. Target checks
              are complete, but value changes from the old revision cannot be
              calculated.
            </p>
          ) : null}
          <dl className="report-facts">
            <div>
              <dt>Referenced records</dt>
              <dd>{preview.referencedDefinitionCount}</dd>
            </div>
            <div>
              <dt>Missing in target</dt>
              <dd>{preview.missingDefinitionIds.length}</dd>
            </div>
            <div>
              <dt>Changed definitions</dt>
              <dd>{preview.changedDefinitionIds.length}</dd>
            </div>
            <div>
              <dt>Calculated stats changed</dt>
              <dd>{preview.statChanges.length}</dd>
            </div>
            <div>
              <dt>Powers changed</dt>
              <dd>{preview.powerChanges.length}</dd>
            </div>
            <div>
              <dt>Target state</dt>
              <dd>
                {preview.target.complete ? "Complete" : "Incomplete"};{" "}
                {preview.target.legal ? "rules legal" : "has legality findings"}
              </dd>
            </div>
          </dl>
          {preview.missingDefinitionIds.length === 0 ? null : (
            <p>
              <strong>Missing IDs:</strong>{" "}
              {preview.missingDefinitionIds.slice(0, 8).join(", ")}
              {preview.missingDefinitionIds.length > 8 ? "…" : ""}
            </p>
          )}
          {preview.statChanges.length === 0 ? null : (
            <details>
              <summary>Calculated stat differences</summary>
              <ul>
                {preview.statChanges.slice(0, 20).map((change) => (
                  <li key={change.name}>
                    {change.name}: {change.before ?? "missing"} →{" "}
                    {change.after ?? "missing"}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {preview.targetDiagnostics.length === 0 ? null : (
            <details>
              <summary>
                Target diagnostics ({preview.targetDiagnostics.length})
              </summary>
              <ul>
                {preview.targetDiagnostics
                  .slice(0, 20)
                  .map((diagnostic, index) => (
                    <li key={`${diagnostic.code}-${index}`}>
                      <strong>{diagnostic.code}</strong>: {diagnostic.message}
                    </li>
                  ))}
              </ul>
            </details>
          )}
          <button
            type="button"
            disabled={!preview.target.converged}
            onClick={() =>
              void adopt().catch((reason: unknown) =>
                onError(
                  reason instanceof Error ? reason.message : String(reason),
                ),
              )
            }
          >
            Adopt this profile revision
          </button>
          {!preview.target.converged ? (
            <p className="profile-warning">
              Adoption is disabled because target evaluation did not converge.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function download(name: string, contents: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface CharacterLibraryPageProps {
  readonly manifests: readonly ContentPackManifest[];
  readonly activePackId?: string;
}

export function CharacterLibraryPage({
  manifests,
  activePackId,
}: CharacterLibraryPageProps) {
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [trash, setTrash] = useState<CharacterRecord[]>([]);
  const [status, setStatus] = useState("Loading character library…");
  const [error, setError] = useState<string>();
  const [report, setReport] = useState<Dnd4eImportReport>();

  const refresh = useCallback(async () => {
    const [active, deleted] = await Promise.all([
      repository.list(),
      repository.list({ deleted: true }),
    ]);
    setCharacters(active);
    setTrash(deleted);
    setStatus(
      active.length === 0
        ? "No characters imported."
        : `${active.length} character${active.length === 1 ? "" : "s"} stored in this browser.`,
    );
  }, []);

  useEffect(() => {
    void refresh().catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : String(reason)),
    );
  }, [refresh]);

  async function importCharacter(file: File): Promise<void> {
    if (file.size > 10 * 1024 * 1024)
      throw new Error("Character file exceeds the 10 MiB import limit");
    const imported = importDnd4e(await file.text());
    const manifest = manifests.find(
      (candidate) => candidate.packId === activePackId,
    );
    const character = newCharacterRecord(
      imported.envelope,
      imported.snapshot,
      imported.build,
      {
        ...(manifest === undefined
          ? {}
          : {
              profileBinding: {
                packId: manifest.packId,
                contentDigest: manifest.contentDigest,
              },
            }),
      },
    );
    await repository.put(character);
    setReport(imported.report);
    await refresh();
    setStatus(`Imported ${character.title}.`);
  }

  async function saveMetadata(
    character: CharacterRecord,
    form: HTMLFormElement,
  ): Promise<void> {
    const data = new FormData(form);
    await repository.updateMetadata(character.id, {
      title: String(data.get("title") ?? ""),
      notes: String(data.get("notes") ?? ""),
    });
    await refresh();
    setStatus("Library details saved.");
  }

  async function exportCharacter(character: CharacterRecord): Promise<void> {
    const xml = exportDnd4e(character.legacy);
    const reimported = importDnd4e(xml);
    const preservation = comparePreservation(
      character.legacy.sourceXml,
      reimported.envelope.sourceXml,
    );
    if (!preservation.identical)
      throw new Error(
        `Preservation check failed at character ${preservation.firstDifference ?? 0}`,
      );
    download(
      `${character.title.replace(/[^a-z0-9_-]+/gi, "-")}.dnd4e`,
      xml,
      "application/xml",
    );
    setStatus(
      "Exported the preserved legacy file; re-import preservation check passed.",
    );
  }

  async function exportBackup(): Promise<void> {
    const backup = await repository.exportBackup();
    download(
      `4ecb-characters-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(backup, null, 2),
      "application/json",
    );
    setStatus(`Backed up ${backup.characters.length} character record(s).`);
  }

  return (
    <main className="characters-page" id="main-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Local library</p>
          <h2>Characters</h2>
          <p>
            Import legacy characters, inspect their cached sheet, and keep
            lossless local backups. No account or server is involved.
          </p>
        </div>
        <div className="heading-actions">
          <label className="file-button">
            Import .dnd4e
            <input
              type="file"
              accept=".dnd4e,application/xml,text/xml"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file !== undefined)
                  void importCharacter(file).catch((reason: unknown) =>
                    setError(
                      reason instanceof Error ? reason.message : String(reason),
                    ),
                  );
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={() =>
              void exportBackup().catch((reason: unknown) =>
                setError(
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
                  void file
                    .text()
                    .then((text) =>
                      repository.restoreBackup(
                        JSON.parse(text) as CharacterBackup,
                      ),
                    )
                    .then(refresh)
                    .catch((reason: unknown) =>
                      setError(
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
      {report === undefined ? null : (
        <section className="import-report" aria-label="Latest import report">
          <h3>Import report</h3>
          <dl className="report-facts">
            <div>
              <dt>Levels</dt>
              <dd>{report.levelCount}</dd>
            </div>
            <div>
              <dt>Selections</dt>
              <dd>{report.selectedRuleCount}</dd>
            </div>
            <div>
              <dt>Powers</dt>
              <dd>{report.powerCount}</dd>
            </div>
            <div>
              <dt>Inventory</dt>
              <dd>{report.lootCount}</dd>
            </div>
          </dl>
          {report.diagnostics.map((diagnostic) => (
            <p
              key={diagnostic.code}
              className={`diagnostic ${diagnostic.severity}`}
            >
              <strong>{diagnostic.severity}:</strong> {diagnostic.message}
            </p>
          ))}
        </section>
      )}
      {characters.length === 0 ? (
        <div className="empty-state">
          <h3>Your local library is empty</h3>
          <p>
            Choose a `.dnd4e` file exported by the legacy Character Builder. The
            original XML remains embedded for compatible export.
          </p>
        </div>
      ) : (
        <ul className="character-grid">
          {characters.map((character) => {
            const profile =
              character.profileBinding === undefined
                ? undefined
                : manifests.find(
                    (manifest) =>
                      manifest.packId === character.profileBinding?.packId,
                  );
            const profileMissing =
              character.profileBinding !== undefined && profile === undefined;
            const profileMismatch =
              profile !== undefined &&
              character.profileBinding?.contentDigest !== undefined &&
              character.profileBinding.contentDigest !== profile.contentDigest;
            return (
              <li key={character.id}>
                <div>
                  <p className="eyebrow">
                    Level {character.snapshot.details.Level || "?"}{" "}
                    {character.snapshot.details.Race}{" "}
                    {character.snapshot.details.Class}
                  </p>
                  <h3>
                    <a
                      href={`#/characters/${encodeURIComponent(character.id)}`}
                    >
                      {character.title}
                    </a>
                  </h3>
                  <p>
                    <a
                      href={`#/characters/${encodeURIComponent(character.id)}/edit`}
                    >
                      Edit build
                    </a>
                  </p>
                  <p
                    className={
                      profileMissing || profileMismatch
                        ? "profile-warning"
                        : "identifier"
                    }
                  >
                    {character.profileBinding === undefined
                      ? "No content profile bound"
                      : profileMissing
                        ? `Missing profile: ${character.profileBinding.packId}`
                        : profileMismatch
                          ? `Profile changed: ${profile.name}; preview and adopt this revision below`
                          : `Profile: ${profile?.name}`}
                  </p>
                </div>
                <form
                  className="metadata-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveMetadata(character, event.currentTarget);
                  }}
                >
                  <label>
                    Library name
                    <input name="title" defaultValue={character.title} />
                  </label>
                  <label>
                    Library notes
                    <textarea
                      name="notes"
                      defaultValue={character.notes}
                      rows={2}
                    />
                  </label>
                  <button type="submit">Save library details</button>
                </form>
                <ProfileMigrationControl
                  character={character}
                  manifests={manifests}
                  onAdopted={async (message) => {
                    await refresh();
                    setStatus(message);
                  }}
                  onError={setError}
                />
                <div className="character-actions">
                  <a
                    className="button-link"
                    href={`#/characters/${encodeURIComponent(character.id)}`}
                  >
                    View sheet
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      void exportCharacter(character).catch((reason: unknown) =>
                        setError(
                          reason instanceof Error
                            ? reason.message
                            : String(reason),
                        ),
                      )
                    }
                  >
                    Export .dnd4e
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void repository.duplicate(character.id).then(refresh)
                    }
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void repository.moveToTrash(character.id).then(refresh)
                    }
                  >
                    Move to trash
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {trash.length === 0 ? null : (
        <details className="trash">
          <summary>Trash ({trash.length})</summary>
          <ul>
            {trash.map((character) => (
              <li key={character.id}>
                <span>{character.title}</span>
                <button
                  type="button"
                  onClick={() =>
                    void repository.restore(character.id).then(refresh)
                  }
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Permanently delete ${character.title}? This cannot be undone.`,
                      )
                    ) {
                      void repository.purge(character.id).then(refresh);
                    }
                  }}
                >
                  Delete permanently
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
