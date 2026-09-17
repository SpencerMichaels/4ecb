import { useCallback, useEffect, useState } from "react";

import {
  CharacterRepository,
  ContentPackRepository,
  type ContentProfileDefinition,
} from "@4ecb/browser-storage";
import {
  newCharacterRecord,
  type CharacterRecord,
} from "@4ecb/character-domain";
import type { ContentPackManifest } from "@4ecb/content-pack";
import {
  compareEditedDnd4eRoundTrip,
  exportEditedDnd4e,
  importDnd4e,
  projectBuildForLegacyExport,
  type Dnd4eImportReport,
} from "@4ecb/legacy-dnd4e";
import { projectBuildForEvaluation } from "@4ecb/rules-engine";

import { contentProfileMatchesRevision } from "./profile-migration";
import { Icon } from "./Icon";
import { RulesWorkerClient } from "./rules-client";
import { createNativeCharacter } from "./new-character";
import { PortraitImage } from "./PortraitEditor";

const repository = new CharacterRepository();
const contentRepository = new ContentPackRepository();

function download(name: string, contents: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function fileBase(character: CharacterRecord): string {
  return character.title.replace(/[^a-z0-9_-]+/gi, "-");
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
  const [creatingCharacter, setCreatingCharacter] = useState(false);
  const [openExportId, setOpenExportId] = useState<string>();

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

  async function exportNativeCharacter(
    character: CharacterRecord,
  ): Promise<void> {
    const backup = await repository.exportCharacter(character.id);
    download(
      `${fileBase(character)}.4ecb`,
      JSON.stringify(backup, null, 2),
      "application/json",
    );
    setStatus(`Exported ${character.title} as a native .4ecb character.`);
  }

  async function exportCharacter(character: CharacterRecord): Promise<void> {
    const binding = character.profileBinding;
    if (binding?.contentDigest === undefined)
      throw new Error(
        "Regenerated .dnd4e export requires an exact content profile revision bound to this character.",
      );
    const pack = await contentRepository.get(binding.packId);
    if (
      pack === undefined ||
      !contentProfileMatchesRevision(binding, pack.manifest)
    )
      throw new Error(
        "Regenerated .dnd4e export requires the exact content profile revision bound to this character.",
      );
    const client = new RulesWorkerClient();
    try {
      await client.initialize(binding.packId, binding.contentDigest);
      const evaluation = await client.evaluate(
        projectBuildForEvaluation(character.build, pack.entities),
      );
      const xml = exportEditedDnd4e({
        target: "legacy-builder-0.07a",
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
      download(`${fileBase(character)}.dnd4e`, xml, "application/xml");
      setStatus(
        evaluation.complete
          ? "Exported current edited state for Legacy Character Builder 0.07a; semantic re-import check passed."
          : "Exported current incomplete edited state for Legacy Character Builder 0.07a; semantic re-import check passed.",
      );
    } finally {
      client.terminate();
    }
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
        "New Character",
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
      <h2 className="visually-hidden">Characters</h2>
      <div className="library-toolbar">
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
            disabled={activePackId === undefined || creatingCharacter}
            onClick={() =>
              void createCharacter().catch((reason: unknown) =>
                setError(
                  reason instanceof Error ? reason.message : String(reason),
                ),
              )
            }
          >
            {creatingCharacter ? "Creating…" : "New Character"}
          </button>
        </div>
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
            original XML remains embedded so regenerated exports preserve
            unknown legacy fields.
          </p>
        </div>
      ) : (
        <ul className="character-grid">
          {characters.map((character) => {
            const identity = [
              `Level ${character.build.effectiveLevel}`,
              character.snapshot.details.Race,
              character.snapshot.details.Class,
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <li key={character.id}>
                <div className="character-card-heading">
                  <PortraitImage
                    className="library-portrait"
                    name={character.title}
                    portrait={character.portrait}
                  />
                  <div>
                    <h3>{character.title}</h3>
                    <p className="character-summary">{identity}</p>
                  </div>
                </div>
                <div className="character-card-actions">
                  <a
                    className="character-card-action"
                    href={`#/characters/${encodeURIComponent(character.id)}/edit`}
                    aria-label={`Edit ${character.title} build`}
                    title="Edit build"
                  >
                    <Icon name="edit" />
                  </a>
                  <a
                    className="character-card-action"
                    href={`#/characters/${encodeURIComponent(character.id)}`}
                    aria-label={`View ${character.title} character sheet`}
                    title="View character sheet"
                  >
                    <Icon name="sheet" />
                  </a>
                  <div className="character-export-menu">
                    <button
                      type="button"
                      className="character-card-action"
                      aria-label={`Export ${character.title}`}
                      aria-expanded={openExportId === character.id}
                      aria-controls={`export-${character.id}`}
                      title="Export"
                      onClick={() =>
                        setOpenExportId((current) =>
                          current === character.id ? undefined : character.id,
                        )
                      }
                    >
                      <Icon name="download" />
                    </button>
                    {openExportId === character.id ? (
                      <div
                        id={`export-${character.id}`}
                        className="character-export-options"
                        aria-label={`Export ${character.title} as`}
                        onKeyDown={(event) => {
                          if (event.key !== "Escape") return;
                          setOpenExportId(undefined);
                          const trigger =
                            event.currentTarget.previousElementSibling;
                          if (trigger instanceof HTMLElement) trigger.focus();
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setOpenExportId(undefined);
                            void exportNativeCharacter(character).catch(
                              (reason: unknown) =>
                                setError(
                                  reason instanceof Error
                                    ? reason.message
                                    : String(reason),
                                ),
                            );
                          }}
                        >
                          .4ecb
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenExportId(undefined);
                            void exportCharacter(character).catch(
                              (reason: unknown) =>
                                setError(
                                  reason instanceof Error
                                    ? reason.message
                                    : String(reason),
                                ),
                            );
                          }}
                        >
                          .dnd4e
                        </button>
                        <a
                          href={`#/characters/${encodeURIComponent(character.id)}?print=1`}
                        >
                          PDF
                        </a>
                      </div>
                    ) : null}
                  </div>
                  <button
                    className="character-card-action"
                    type="button"
                    aria-label={`Duplicate ${character.title}`}
                    title="Duplicate"
                    onClick={() =>
                      void repository
                        .duplicate(character.id)
                        .then(refresh)
                        .catch((reason: unknown) =>
                          setError(
                            reason instanceof Error
                              ? reason.message
                              : String(reason),
                          ),
                        )
                    }
                  >
                    <Icon name="duplicate" />
                  </button>
                  <button
                    className="character-card-action danger-action"
                    type="button"
                    aria-label={`Move ${character.title} to trash`}
                    title="Move to trash"
                    onClick={() =>
                      void repository
                        .moveToTrash(character.id)
                        .then(refresh)
                        .catch((reason: unknown) =>
                          setError(
                            reason instanceof Error
                              ? reason.message
                              : String(reason),
                          ),
                        )
                    }
                  >
                    <Icon name="trash" />
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
