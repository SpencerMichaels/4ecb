import { useCallback, useEffect, useState } from "react";

import {
  CharacterRepository,
  ContentPackRepository,
  type CharacterLibraryEntry,
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
} from "@4ecb/legacy-dnd4e";
import { projectBuildForEvaluation } from "@4ecb/rules-engine";

import { contentProfileMatchesRevision } from "./profile-migration";
import { activeProfileBinding } from "./content-update";
import { download } from "./download";
import { Icon } from "./Icon";
import { RulesWorkerClient } from "./rules-client";
import { createNativeCharacter } from "./new-character";
import { PortraitImage } from "./PortraitEditor";
import { PersistenceBanner } from "./PersistenceBanner";
import { ToastRegion, useToasts } from "./Toasts";
import { useArmedAction } from "./useArmedAction";

const repository = new CharacterRepository();
const contentRepository = new ContentPackRepository();

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
  const [characters, setCharacters] = useState<
    readonly CharacterLibraryEntry[]
  >([]);
  const [trash, setTrash] = useState<readonly CharacterLibraryEntry[]>([]);
  const toasts = useToasts();
  const pushToast = toasts.push;
  const reportFailure = useCallback(
    (reason: unknown, title = "Something went wrong") =>
      pushToast({
        tone: "error",
        title,
        messages: [reason instanceof Error ? reason.message : String(reason)],
      }),
    [pushToast],
  );
  const [creatingCharacter, setCreatingCharacter] = useState(false);
  const [openExportId, setOpenExportId] = useState<string>();
  // A "Move to trash"/"Delete permanently" click arms the button (a second
  // click confirms) instead of a native confirm() dialog; clicking
  // elsewhere or pressing Escape disarms it.
  const trashAction = useArmedAction("character-trash-trigger");
  const purgeAction = useArmedAction("trash-purge-trigger");

  const refresh = useCallback(async () => {
    const { active, deleted } = await repository.listMetadataPartitioned();
    setCharacters(active);
    setTrash(deleted);
  }, []);

  useEffect(() => {
    void refresh().catch((reason: unknown) =>
      reportFailure(reason, "Couldn't load the character library"),
    );
  }, [refresh, reportFailure]);

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
              profileBinding: activeProfileBinding(manifest, activeProfile),
            }),
      },
    );
    await repository.put(character);
    await refresh();
    const warnings = imported.report.diagnostics.filter(
      (diagnostic) => diagnostic.severity !== "info",
    );
    if (warnings.length > 0)
      pushToast({
        tone: warnings.some((warning) => warning.severity === "error")
          ? "error"
          : "warning",
        title: `Imported ${character.title} with warnings`,
        messages: warnings.map((warning) => warning.message),
      });
  }

  async function exportNativeCharacter(
    summary: CharacterLibraryEntry,
  ): Promise<void> {
    const character = await repository.required(summary.id);
    const backup = await repository.exportCharacter(character.id);
    download(
      `${fileBase(character)}.4ecb`,
      JSON.stringify(backup, null, 2),
      "application/json",
    );
  }

  async function exportCharacter(
    summary: CharacterLibraryEntry,
  ): Promise<void> {
    const character = await repository.required(summary.id);
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
      window.location.hash = `#/characters/${encodeURIComponent(character.id)}/edit`;
    } finally {
      setCreatingCharacter(false);
    }
  }

  const newCharacterLabel =
    activePackId === undefined
      ? "Turn on game content in Settings to create a character"
      : creatingCharacter
        ? "Creating character…"
        : "New character";

  return (
    <main className="characters-page" id="main-content">
      <header className="page-heading library-heading">
        <h1 className="app-brand">
          <span className="app-brand-mark" aria-hidden="true">
            4E
          </span>
          <span className="app-brand-name">Character Builder</span>
          <span className="visually-hidden"> — Characters</span>
        </h1>
        <div className="page-actions">
          <label className="icon-only-button" title="Import .dnd4e character">
            <Icon name="import" />
            <input
              aria-label="Import .dnd4e character"
              className="visually-hidden"
              type="file"
              accept=".dnd4e,application/xml,text/xml"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file !== undefined)
                  void importCharacter(file).catch((reason: unknown) =>
                    reportFailure(reason, `Couldn't import ${file.name}`),
                  );
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button
            aria-label={newCharacterLabel}
            className="icon-only-button button-icon"
            type="button"
            title={newCharacterLabel}
            // aria-disabled, not disabled, so the tooltip saying why shows.
            aria-disabled={activePackId === undefined || undefined}
            disabled={creatingCharacter}
            onClick={() => {
              if (activePackId === undefined) return;
              void createCharacter().catch((reason: unknown) =>
                reportFailure(reason),
              );
            }}
          >
            <Icon name="new-character" />
          </button>
          <span aria-hidden="true" className="builder-actions-divider" />
          <a
            aria-label="Settings"
            className="icon-only-button button-icon"
            href="#/settings"
            title="Settings"
          >
            <Icon name="settings" />
          </a>
        </div>
      </header>
      <ToastRegion toasts={toasts.toasts} onDismiss={toasts.dismiss} />
      {characters.length === 0 ? (
        <div className="empty-state">
          <h2>No characters yet</h2>
          <p>
            Create one with New character, or import a .dnd4e file from the
            legacy Character Builder.
          </p>
        </div>
      ) : (
        <>
          <PersistenceBanner onFailure={reportFailure} />
          <ul className="character-grid">
            {characters.map((character) => {
              const identity = [
                `Level ${character.effectiveLevel}`,
                character.race,
                character.className,
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <li key={character.id}>
                  <div className="character-card-heading">
                    <PortraitImage
                      className="library-portrait"
                      name={character.title}
                      portrait={
                        character.renderedPortraitDataUrl === undefined
                          ? undefined
                          : {
                              renderedDataUrl:
                                character.renderedPortraitDataUrl,
                            }
                      }
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
                      href={`#/characters/${encodeURIComponent(character.id)}?preview=1`}
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
                        <Icon name="export" />
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
                                  reportFailure(
                                    reason,
                                    `Couldn't export ${character.title}`,
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
                                  reportFailure(
                                    reason,
                                    `Couldn't export ${character.title}`,
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
                          .catch((reason: unknown) => reportFailure(reason))
                      }
                    >
                      <Icon name="duplicate" />
                    </button>
                    <button
                      className="character-card-action danger-action"
                      type="button"
                      data-character-trash-trigger={character.id}
                      data-armed={
                        trashAction.isArmed(character.id) || undefined
                      }
                      aria-label={
                        trashAction.isArmed(character.id)
                          ? `Confirm moving ${character.title} to trash`
                          : `Move ${character.title} to trash`
                      }
                      title={
                        trashAction.isArmed(character.id)
                          ? "Click again to move to trash"
                          : "Move to trash"
                      }
                      onClick={() => {
                        if (!trashAction.isArmed(character.id)) {
                          trashAction.arm(character.id);
                          return;
                        }
                        trashAction.disarm();
                        void repository
                          .moveToTrash(character.id)
                          .then(refresh)
                          .catch((reason: unknown) => reportFailure(reason));
                      }}
                    >
                      <Icon
                        name={
                          trashAction.isArmed(character.id)
                            ? "warning"
                            : "trash"
                        }
                      />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {trash.length === 0 ? null : (
        <details className="trash">
          <summary>Trash ({trash.length})</summary>
          <ul>
            {trash.map((character) => {
              const purgeArmed = purgeAction.isArmed(character.id);
              return (
                <li key={character.id}>
                  <span>{character.title}</span>
                  <button
                    type="button"
                    onClick={() => {
                      purgeAction.disarm();
                      void repository
                        .restore(character.id)
                        .then(refresh)
                        .catch((reason: unknown) =>
                          reportFailure(
                            reason,
                            `Couldn't restore ${character.title}`,
                          ),
                        );
                    }}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    data-trash-purge-trigger={character.id}
                    data-armed={purgeArmed || undefined}
                    onClick={() => {
                      if (!purgeArmed) {
                        purgeAction.arm(character.id);
                        return;
                      }
                      purgeAction.disarm();
                      void repository
                        .purge(character.id)
                        .then(refresh)
                        .catch((reason: unknown) =>
                          reportFailure(
                            reason,
                            `Couldn't delete ${character.title}`,
                          ),
                        );
                    }}
                  >
                    {purgeArmed
                      ? "Click again to delete permanently"
                      : "Delete permanently"}
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </main>
  );
}
