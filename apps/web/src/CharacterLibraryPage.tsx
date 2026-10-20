import { useCallback, useEffect, useState } from "react";

import {
  CharacterRepository,
  ContentPackRepository,
  type CharacterLibraryEntry,
  type ContentProfileDefinition,
} from "@4ecb/browser-storage";
import { newCharacterRecord } from "@4ecb/character-domain";
import type { ContentPackManifest } from "@4ecb/content-pack";
import { importDnd4e } from "@4ecb/legacy-dnd4e";

import { activeProfileBinding } from "./content-update";
import { Icon } from "./Icon";
import { UpdateButton } from "./PwaUpdate";
import { BuildVersion } from "./BuildVersion";
import { createNativeCharacter } from "./new-character";
import { PortraitImage } from "./PortraitEditor";
import { holdCharacterDraft } from "./character-drafts";
import { ActionMenu } from "./ActionMenu";
import {
  exportCharacterBackup,
  exportCharacterDnd4e,
} from "./character-export";
import { PersistenceBanner } from "./PersistenceBanner";
import { ToastRegion, useToasts } from "./Toasts";
import { TrashDialog } from "./TrashDialog";
import { useArmedAction } from "./useArmedAction";

const repository = new CharacterRepository();
const contentRepository = new ContentPackRepository();

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
  // A "Move to trash"/"Delete permanently" click arms the button (a second
  // click confirms) instead of a native confirm() dialog; clicking
  // elsewhere or pressing Escape disarms it.
  const trashAction = useArmedAction("character-trash-trigger");
  const [trashOpen, setTrashOpen] = useState(false);
  // A .dnd4e export evaluates the character in a fresh rules worker, which
  // takes a while; its card's Export button spins until the download starts.
  const [exportingIds, setExportingIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const exportCharacter = (
    character: { readonly id: string; readonly title: string },
    write: (id: string) => Promise<void>,
  ): void => {
    setExportingIds((current) => new Set(current).add(character.id));
    void write(character.id)
      .catch((reason: unknown) =>
        reportFailure(reason, `Couldn't export ${character.title}`),
      )
      .finally(() =>
        setExportingIds((current) => {
          const next = new Set(current);
          next.delete(character.id);
          return next;
        }),
      );
  };

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
    if (/\.(4ecb|json)$/i.test(file.name)) {
      await importNativeCharacters(file);
      return;
    }
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

  /** A .4ecb package keeps its own content binding and portrait; it is
   *  added alongside, never over, characters already in the library. */
  async function importNativeCharacters(file: File): Promise<void> {
    if (file.size > 100 * 1024 * 1024)
      throw new Error("Character package exceeds the 100 MiB import limit");
    let value: unknown;
    try {
      value = JSON.parse(await file.text());
    } catch {
      throw new Error("Not a valid .4ecb character package");
    }
    await repository.importCharacters(value);
    await refresh();
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
      // Held unsaved until its first change, so closing it adds nothing.
      holdCharacterDraft(character);
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
        <div className="library-brand">
          <h1 className="app-brand">
            <span className="app-brand-mark" aria-hidden="true">
              4E
            </span>
            <span className="app-brand-name">Character Builder</span>
            <span className="visually-hidden"> — Characters</span>
          </h1>
          <BuildVersion />
        </div>
        <div className="page-actions">
          <label
            className="icon-only-button"
            title="Import character (.4ecb or .dnd4e)"
          >
            <Icon name="import" />
            <input
              aria-label="Import character (.4ecb or .dnd4e)"
              className="visually-hidden"
              type="file"
              accept=".4ecb,.dnd4e,application/json,application/xml,text/xml"
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
          <button
            aria-label={`Trash, ${trash.length} ${trash.length === 1 ? "character" : "characters"}`}
            className="icon-only-button button-icon page-action-count"
            title={`Trash (${trash.length})`}
            type="button"
            onClick={() => setTrashOpen(true)}
          >
            <Icon name="trash" />
            <span aria-hidden="true">{trash.length}</span>
          </button>
          <span aria-hidden="true" className="builder-actions-divider" />
          <UpdateButton />
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
            Create one with New character, import a .4ecb character, or import a
            .dnd4e file from the legacy Character Builder.
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
                    <ActionMenu
                      icon="export"
                      label={`Export ${character.title}`}
                      {...(exportingIds.has(character.id)
                        ? { busyLabel: `Exporting ${character.title}…` }
                        : {})}
                      menuLabel={`Export ${character.title} as`}
                      triggerClassName="character-card-action"
                      items={[
                        {
                          label: ".4ecb",
                          onSelect: () =>
                            exportCharacter(character, exportCharacterBackup),
                        },
                        {
                          label: ".dnd4e",
                          onSelect: () =>
                            exportCharacter(character, exportCharacterDnd4e),
                        },
                      ]}
                    />
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
      {trashOpen ? (
        <TrashDialog
          characters={trash}
          onClose={() => setTrashOpen(false)}
          onRestore={(character) =>
            void repository
              .restore(character.id)
              .then(refresh)
              .catch((reason: unknown) =>
                reportFailure(reason, `Couldn't restore ${character.title}`),
              )
          }
          onPurge={(character) =>
            void repository
              .purge(character.id)
              .then(refresh)
              .catch((reason: unknown) =>
                reportFailure(reason, `Couldn't delete ${character.title}`),
              )
          }
        />
      ) : null}
    </main>
  );
}
