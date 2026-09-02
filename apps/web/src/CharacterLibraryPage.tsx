import { useCallback, useEffect, useState } from "react";

import {
  CharacterRepository,
  ContentPackRepository,
  type CharacterBackupInspection,
  type ContentProfileDefinition,
} from "@4ecb/browser-storage";
import {
  newCharacterRecord,
  type CharacterRecord,
} from "@4ecb/character-domain";
import type { ContentPackManifest } from "@4ecb/content-pack";
import {
  compareEditedDnd4eRoundTrip,
  comparePreservation,
  DND4E_EXPORT_TARGETS,
  exportDnd4e,
  exportEditedDnd4e,
  importDnd4e,
  projectBuildForLegacyExport,
  type Dnd4eExportTarget,
  type Dnd4eImportReport,
} from "@4ecb/legacy-dnd4e";
import {
  projectBuildForEvaluation,
  type ProfileMigrationPreview,
} from "@4ecb/rules-engine";

import {
  contentProfileMatchesRevision,
  contentProfileRevisionKey,
  previewMatchesTargetRevision,
} from "./profile-migration";
import { RulesWorkerClient } from "./rules-client";
import { createNativeCharacter } from "./new-character";

const repository = new CharacterRepository();
const contentRepository = new ContentPackRepository();

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
  readonly activeProfile?: ContentProfileDefinition;
}

export function CharacterLibraryPage({
  manifests,
  activePackId,
  activeProfile,
}: CharacterLibraryPageProps) {
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [trash, setTrash] = useState<CharacterRecord[]>([]);
  const [status, setStatus] = useState("Loading character library…");
  const [error, setError] = useState<string>();
  const [report, setReport] = useState<Dnd4eImportReport>();
  const [exportTargets, setExportTargets] = useState<
    Readonly<Record<string, Dnd4eExportTarget>>
  >({});
  const [pendingBackup, setPendingBackup] = useState<{
    readonly value: unknown;
    readonly inspection: CharacterBackupInspection;
  }>();
  const [newCharacterName, setNewCharacterName] = useState("");
  const [creatingCharacter, setCreatingCharacter] = useState(false);

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
                ...(activeProfile?.materializedPackId === manifest.packId
                  ? {
                      layers: activeProfile.layers,
                      resolutionPolicy: activeProfile.resolutionPolicy,
                    }
                  : {}),
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

  async function exportCharacter(
    character: CharacterRecord,
    target: Dnd4eExportTarget,
  ): Promise<void> {
    let xml: string;
    let message: string;
    if (target === "preserve-original") {
      xml = exportDnd4e(character.legacy);
      const reimported = importDnd4e(xml);
      const preservation = comparePreservation(
        character.legacy.sourceXml,
        reimported.envelope.sourceXml,
      );
      if (!preservation.identical)
        throw new Error(
          `Preservation check failed at character ${preservation.firstDifference ?? 0}`,
        );
      message =
        "Exported the original imported file byte-for-byte. Local build edits are intentionally excluded.";
    } else {
      const binding = character.profileBinding;
      if (binding?.contentDigest === undefined)
        throw new Error(
          "Edited export requires an adopted content profile revision. Preview and adopt an installed revision first.",
        );
      const pack = await contentRepository.get(binding.packId);
      if (
        pack === undefined ||
        !contentProfileMatchesRevision(binding, pack.manifest)
      )
        throw new Error(
          "Edited export requires the exact content profile revision bound to this character.",
        );
      const client = new RulesWorkerClient();
      try {
        await client.initialize(binding.packId, binding.contentDigest);
        const evaluation = await client.evaluate(
          projectBuildForEvaluation(character.build, pack.entities),
        );
        xml = exportEditedDnd4e({
          target,
          envelope: character.legacy,
          snapshot: character.snapshot,
          build: character.build,
          evaluation,
          content: pack.entities,
        });
        const reimported = importDnd4e(xml);
        const comparison = compareEditedDnd4eRoundTrip(
          projectBuildForLegacyExport(character.build),
          reimported.build,
        );
        if (!comparison.equivalent)
          throw new Error(
            `Edited export re-import check failed: ${comparison.differences.join(" ")}`,
          );
        message = evaluation.complete
          ? "Exported edited state for Legacy Character Builder 0.07a; semantic re-import check passed."
          : "Exported incomplete edited state for Legacy Character Builder 0.07a; semantic re-import check passed.";
      } finally {
        client.terminate();
      }
    }
    download(
      `${character.title.replace(/[^a-z0-9_-]+/gi, "-")}.dnd4e`,
      xml,
      "application/xml",
    );
    setStatus(message);
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

  async function inspectBackupFile(file: File): Promise<void> {
    if (file.size > 100 * 1024 * 1024)
      throw new Error("Backup exceeds the 100 MiB inspection limit");
    const value: unknown = JSON.parse(await file.text());
    const inspection = await repository.inspectBackup(value);
    setPendingBackup({ value, inspection });
    setStatus(
      `Inspected ${inspection.characterCount} backup record(s); no data has been restored yet.`,
    );
  }

  async function restoreInspectedBackup(): Promise<void> {
    if (pendingBackup === undefined) return;
    const restored = await repository.restoreBackup(pendingBackup.value);
    setPendingBackup(undefined);
    await refresh();
    setStatus(`Restored ${restored} backup record(s).`);
  }

  async function createCharacter(): Promise<void> {
    if (activePackId === undefined)
      throw new Error(
        "Activate a content profile before creating a character.",
      );
    const pack = await contentRepository.get(activePackId);
    if (pack === undefined)
      throw new Error("The active content profile is not installed.");
    setCreatingCharacter(true);
    try {
      const character = createNativeCharacter(
        newCharacterName.trim(),
        pack.manifest,
        pack.entities,
        activeProfile === undefined
          ? {}
          : {
              profileBinding: {
                packId: activeProfile.materializedPackId,
                contentDigest: activeProfile.contentDigest,
                layers: activeProfile.layers,
                resolutionPolicy: activeProfile.resolutionPolicy,
              },
            },
      );
      await repository.put(character);
      setStatus(`Created ${character.title} at level 1.`);
      window.location.hash = `#/characters/${encodeURIComponent(character.id)}/edit`;
    } finally {
      setCreatingCharacter(false);
    }
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
                  void inspectBackupFile(file).catch((reason: unknown) =>
                    setError(
                      reason instanceof Error ? reason.message : String(reason),
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
      <section className="panel">
        <div>
          <p className="eyebrow">Profile-bound level 1</p>
          <h3>Create a new character</h3>
          <p>
            Start an empty authoritative build from the active profile. The
            generic editor will present that profile&apos;s required race,
            class, ability, and other level-1 choices.
          </p>
        </div>
        <form
          className="metadata-form"
          onSubmit={(event) => {
            event.preventDefault();
            setError(undefined);
            void createCharacter().catch((reason: unknown) =>
              setError(
                reason instanceof Error ? reason.message : String(reason),
              ),
            );
          }}
        >
          <label>
            Character name
            <input
              value={newCharacterName}
              maxLength={120}
              required
              disabled={creatingCharacter}
              onChange={(event) =>
                setNewCharacterName(event.currentTarget.value)
              }
            />
          </label>
          <div>
            <p className="field-help">
              {activePackId === undefined
                ? "Activate a content profile in Content settings first."
                : `New records bind to ${manifests.find((manifest) => manifest.packId === activePackId)?.name ?? activePackId} and its exact digest.`}
            </p>
            <button
              type="submit"
              disabled={activePackId === undefined || creatingCharacter}
            >
              {creatingCharacter ? "Creating…" : "Create and edit"}
            </button>
          </div>
        </form>
      </section>
      {pendingBackup === undefined ? null : (
        <section className="import-report" aria-label="Backup restore preview">
          <h3>Backup restore preview</h3>
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
                  setError(
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
        </section>
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
            Create a level-1 character from the active profile above, or choose
            a `.dnd4e` file exported by the legacy Character Builder. Imported
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
            const exportOptions =
              character.legacy.origin === "native"
                ? DND4E_EXPORT_TARGETS.filter(
                    (option) => option.id === "legacy-builder-0.07a",
                  )
                : DND4E_EXPORT_TARGETS;
            const exportTarget =
              exportTargets[character.id] ?? exportOptions[0]!.id;
            return (
              <li key={character.id}>
                <div>
                  <p className="eyebrow">
                    Level {character.build.effectiveLevel}{" "}
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
                  <label>
                    Export target
                    <select
                      value={exportTarget}
                      onChange={(event) => {
                        const target = event.currentTarget
                          .value as Dnd4eExportTarget;
                        setExportTargets((current) => ({
                          ...current,
                          [character.id]: target,
                        }));
                      }}
                    >
                      {exportOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      void exportCharacter(character, exportTarget).catch(
                        (reason: unknown) =>
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
