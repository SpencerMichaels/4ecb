import { useCallback, useEffect, useState } from "react";

import {
  CampaignRepository,
  CharacterRepository,
  ContentPackRepository,
  type CharacterLibraryEntry,
  type ContentProfileDefinition,
} from "@4ecb/browser-storage";
import {
  newCharacterRecord,
  type CharacterBuild,
  type CharacterRecord,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { ContentPackManifest } from "@4ecb/content-pack";
import { importDnd4e, readCampaignSetting } from "@4ecb/legacy-dnd4e";

import {
  CAMPAIGNS_CHANGED_EVENT,
  campaignChangeTarget,
  type ContentTarget,
} from "./campaign-profile";
import { activeProfileBinding } from "./content-update";
import { ContentUpdateDialog } from "./ContentUpdateDialog";
import { ImportedCampaignDialog } from "./ImportedCampaignDialog";
import {
  campaignOfferForSave,
  createImportedCampaign,
  type ImportedCampaignOffer,
} from "./imported-campaign";
import { Icon } from "./Icon";
import { importReportToast } from "./import-report";
import { UpdateButton } from "./PwaUpdate";
import { BuildVersion } from "./BuildVersion";
import { startNewCharacter } from "./create-character";
import {
  characterCount,
  firstImportedRow,
  librarySelection,
  nextLibrarySort,
  readLibraryView,
  sortLibrary,
  writeLibraryView,
  type LibraryView,
} from "./character-library-ui";
import { CharacterLibraryDetail } from "./CharacterLibraryDetail";
import { CharacterLibraryTable } from "./CharacterLibraryTable";
import {
  ReceiveCharacterDialog,
  ShareCharacterDialog,
} from "./CharacterShareDialogs";
import {
  CharacterConflictDialog,
  importConflictText,
} from "./RestoreBackupDialog";
import { RulesWorkerClient } from "./rules-client";
import {
  exportCharacterBackup,
  exportCharacterDnd4e,
} from "./character-export";
import { PersistenceBanner } from "./PersistenceBanner";
import { ToastRegion, useToasts } from "./Toasts";
import { TrashDialog } from "./TrashDialog";
import { useArmedAction } from "./useArmedAction";
import { useLibrarySummary } from "./use-library-summary";

const repository = new CharacterRepository();

/**
 * An imported save keeps a psion's Sending or a Wild Sage's ritual as known
 * loot; the active content asks for it as a Ritual choice (D115), so the
 * import fills that choice from the loot (rules worker). Only a save with
 * free known loot needs the worker; a failure keeps the choice open.
 */
async function withImportedRitualChoices(
  build: CharacterBuild,
  manifest: ContentPackManifest,
): Promise<CharacterBuild> {
  if (
    !build.known.some(
      ({ acquisition, legacyLoot }) =>
        acquisition === "free" && legacyLoot !== undefined,
    )
  )
    return build;
  const client = new RulesWorkerClient();
  try {
    await client.initialize(manifest.packId, manifest.contentDigest);
    return await client.fillRitualChoices(build);
  } catch {
    return build;
  } finally {
    client.terminate();
  }
}
const contentRepository = new ContentPackRepository();
const campaignRepository = new CampaignRepository();

export interface CharacterLibraryPageProps {
  readonly manifests: readonly ContentPackManifest[];
  readonly activePackId?: string;
  readonly activeProfile?: ContentProfileDefinition;
  /** Settings: point saved IDs the active content lacks at same-named records. */
  readonly matchMissingContentByName?: boolean;
  /** runtime-config.json's features.characterShare (D122). */
  readonly characterShare?: boolean;
}

export function CharacterLibraryPage({
  manifests,
  activePackId,
  activeProfile,
  matchMissingContentByName = true,
  characterShare,
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
  // A legacy save made in a campaign (D116): first the offer to join or
  // create its campaign, then the move's review in the update dialog.
  const [campaignOffer, setCampaignOffer] = useState<{
    readonly character: CharacterRecord;
    readonly offer: ImportedCampaignOffer;
  }>();
  const [campaignMove, setCampaignMove] = useState<{
    readonly character: CharacterRecord;
    readonly target: ContentTarget;
  }>();
  // A "Move to trash"/"Delete permanently" click arms the button (a second
  // click confirms) instead of a native confirm() dialog; clicking
  // elsewhere or pressing Escape disarms it.
  const trashAction = useArmedAction("character-trash-trigger");
  const [trashOpen, setTrashOpen] = useState(false);
  // Share (D122): the character whose code is shown; Receive's dialog.
  const [sharing, setSharing] = useState<{
    readonly id: string;
    readonly title: string;
  }>();
  const [receiving, setReceiving] = useState(false);
  // A .4ecb package (imported or received) holding characters already in
  // the library waits here for Replace / Keep both / Cancel.
  const [pendingImport, setPendingImport] = useState<{
    readonly value: unknown;
    readonly title: string;
    readonly text: string;
    readonly count: number;
  }>();
  // Sort and selection are remembered per browser.
  const [view, setView] = useState<LibraryView>(() => readLibraryView());
  const updateView = useCallback(
    (change: (current: LibraryView) => LibraryView) =>
      setView((current) => {
        const next = change(current);
        writeLibraryView(next);
        return next;
      }),
    [],
  );
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
    return active;
  }, []);

  /** An import's rows can land anywhere in the sorted table, possibly
   *  scrolled out of view: select the topmost one, which the table scrolls
   *  to (imports are otherwise silent, so this is their confirmation). */
  async function refreshRevealing(
    importedIds: readonly string[],
  ): Promise<void> {
    const active = await refresh();
    updateView((current) => {
      const selectedId = firstImportedRow(active, current.sort, importedIds);
      return selectedId === undefined ? current : { ...current, selectedId };
    });
  }

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
    const text = await file.text();
    let activeEntities: Promise<readonly ContentEntity[]> | undefined;
    const loadActiveEntities = () =>
      (activeEntities ??=
        activePackId === undefined
          ? Promise.resolve([])
          : contentRepository
              .get(activePackId)
              .then((pack) => pack?.entities ?? []));
    const content = matchMissingContentByName
      ? activePackId === undefined
        ? undefined
        : await loadActiveEntities()
      : undefined;
    const imported = importDnd4e(
      text,
      content === undefined ? {} : { matchMissingDefinitionsIn: content },
    );
    const manifest = manifests.find(
      (candidate) => candidate.packId === activePackId,
    );
    const character = newCharacterRecord(
      imported.envelope,
      imported.snapshot,
      manifest === undefined
        ? imported.build
        : await withImportedRitualChoices(imported.build, manifest),
      {
        ...(manifest === undefined
          ? {}
          : {
              profileBinding: activeProfileBinding(manifest, activeProfile),
            }),
      },
    );
    await repository.put(character);
    await refreshRevealing([character.id]);
    const toast = importReportToast(character.title, imported.report);
    if (toast !== undefined) pushToast(toast);
    // A campaign block is offered only once the character is on content it
    // can move from.
    if (manifest === undefined) return;
    const offer = await campaignOfferForSave(readCampaignSetting(text), {
      installed: () => campaignRepository.list(),
      baseEntities: loadActiveEntities,
    });
    if (offer !== undefined) setCampaignOffer({ character, offer });
  }

  async function importNativeCharacters(file: File): Promise<void> {
    if (file.size > 100 * 1024 * 1024)
      throw new Error("Character package exceeds the 100 MiB import limit");
    let value: unknown;
    try {
      value = JSON.parse(await file.text());
    } catch {
      throw new Error("Not a valid .4ecb character package");
    }
    (await importNativePackage(value, "Import character"))?.();
  }

  /**
   * The one native import, for a .4ecb file and a received share alike: a
   * package keeps its own content binding and portrait. When none of its
   * characters is in the library (active or trashed) it is added at once;
   * otherwise the returned step asks Replace / Keep both / Cancel (run it
   * once any dialog that led here has closed).
   */
  async function importNativePackage(
    value: unknown,
    title: string,
  ): Promise<(() => void) | undefined> {
    const inspection = await repository.inspectBackup(value);
    if (inspection.conflictingIds.length === 0) {
      const imported = await repository.importCharacters(value);
      await refreshRevealing(imported.map(({ id }) => id));
      return undefined;
    }
    const trashed = new Set(trash.map(({ id }) => id));
    return () =>
      setPendingImport({
        value,
        title,
        text: importConflictText(
          inspection.conflictingTitles,
          inspection.conflictingIds.map((id) => trashed.has(id)),
        ),
        count: inspection.conflictingIds.length,
      });
  }

  function finishPendingImport(replaceExisting: boolean): void {
    if (pendingImport === undefined) return;
    const { value, title } = pendingImport;
    setPendingImport(undefined);
    void repository
      .importCharacters(value, { replaceExisting })
      .then((imported) => refreshRevealing(imported.map(({ id }) => id)))
      .catch((reason: unknown) =>
        reportFailure(reason, `Couldn't ${title.toLowerCase()}`),
      );
  }

  async function createCharacter(): Promise<void> {
    setCreatingCharacter(true);
    try {
      await startNewCharacter({
        activePackId,
        activeProfile,
        loadPack: (packId) => contentRepository.get(packId),
      });
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

  const now = new Date();
  const sorted = sortLibrary(characters, view.sort);
  const selectedId = librarySelection(sorted, view.selectedId);
  const selected = characters.find(({ id }) => id === selectedId);
  // Role line: the saved summary, or evaluated in the background.
  const roleLine = useLibrarySummary(selected);

  return (
    <main className="characters-page" id="main-content">
      <header className="page-heading library-heading">
        <div className="library-brand">
          <h1 className="app-brand">
            <img
              className="app-brand-mark"
              src={`${import.meta.env.BASE_URL}icon.svg`}
              alt=""
              aria-hidden="true"
            />
            <span className="app-brand-name">Character Builder</span>
            <span className="visually-hidden"> — Characters</span>
          </h1>
          <BuildVersion />
        </div>
        <div className="page-actions library-page-actions">
          <button
            aria-label="New character"
            {...(newCharacterLabel === "New character"
              ? {}
              : { "aria-description": newCharacterLabel })}
            className="button-icon"
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
            <span className="page-action-label">New</span>
          </button>
          <label title="Import character (.4ecb or .dnd4e)">
            <Icon name="import" />
            <span aria-hidden="true" className="page-action-label">
              Import
            </span>
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
            aria-label="Receive a shared character"
            className="button-icon"
            title="Receive a shared character"
            type="button"
            onClick={() => setReceiving(true)}
          >
            <Icon name="download" />
            <span aria-hidden="true" className="page-action-label">
              Receive
            </span>
          </button>
          <button
            aria-label={`Trash, ${characterCount(trash.length)}`}
            className="button-icon"
            title={`Trash (${trash.length})`}
            type="button"
            onClick={() => setTrashOpen(true)}
          >
            <Icon name="trash" />
            <span aria-hidden="true" className="page-action-label">
              Trash
            </span>
            <span aria-hidden="true" className="page-action-count">
              {trash.length}
            </span>
          </button>
          <span aria-hidden="true" className="builder-actions-divider" />
          <UpdateButton label="Update" />
          <a aria-label="Settings" href="#/settings" title="Settings">
            <Icon name="settings" />
            <span aria-hidden="true" className="page-action-label">
              Settings
            </span>
          </a>
        </div>
      </header>
      <ToastRegion toasts={toasts.toasts} onDismiss={toasts.dismiss} />
      {characters.length === 0 ? null : (
        <PersistenceBanner onFailure={reportFailure} />
      )}
      <div className="library-workspace">
        <CharacterLibraryTable
          characters={sorted}
          sort={view.sort}
          selectedId={selectedId}
          now={now}
          onSortChange={(column) =>
            updateView((current) => ({
              ...current,
              sort: nextLibrarySort(current.sort, column),
            }))
          }
          onSelect={(id) => {
            if (id !== selectedId) trashAction.disarm();
            updateView((current) => ({ ...current, selectedId: id }));
          }}
        />
        {selected === undefined || roleLine === undefined ? (
          <div className="empty-state library-empty">
            <h2>No characters yet</h2>
            <p>
              Create one with New character, import a .4ecb character, or import
              a .dnd4e file from the legacy Character Builder.
            </p>
          </div>
        ) : (
          <CharacterLibraryDetail
            character={selected}
            roleLine={roleLine}
            now={now}
            exporting={exportingIds.has(selected.id)}
            trashArmed={trashAction.isArmed(selected.id)}
            onExportBackup={() =>
              exportCharacter(selected, exportCharacterBackup)
            }
            onExportDnd4e={() =>
              exportCharacter(selected, exportCharacterDnd4e)
            }
            onShare={() =>
              setSharing({ id: selected.id, title: selected.title })
            }
            onDuplicate={() =>
              void repository
                .duplicate(selected.id)
                .then((copy) => {
                  updateView((current) => ({
                    ...current,
                    selectedId: copy.id,
                  }));
                  return refresh();
                })
                .catch((reason: unknown) => reportFailure(reason))
            }
            onTrash={() => {
              if (!trashAction.isArmed(selected.id)) {
                trashAction.arm(selected.id);
                return;
              }
              trashAction.disarm();
              void repository
                .moveToTrash(selected.id)
                .then(refresh)
                .catch((reason: unknown) => reportFailure(reason));
            }}
          />
        )}
      </div>
      {campaignOffer === undefined ? null : (
        <ImportedCampaignDialog
          characterName={campaignOffer.character.title || "This character"}
          offer={campaignOffer.offer}
          onCancel={() => setCampaignOffer(undefined)}
          onCreate={async () => {
            const { offer } = campaignOffer;
            if (offer.kind !== "create") throw new Error("Nothing to create");
            const campaign = await createImportedCampaign(offer, (document) =>
              campaignRepository.install(document),
            );
            window.dispatchEvent(new Event(CAMPAIGNS_CHANGED_EVENT));
            return campaign;
          }}
          onJoin={(campaign) => {
            const { character } = campaignOffer;
            setCampaignOffer(undefined);
            const manifest = manifests.find(
              (candidate) => candidate.packId === activePackId,
            );
            const target = campaignChangeTarget(campaign, {
              manifest,
              profile: activeProfile,
            });
            if (target !== undefined) setCampaignMove({ character, target });
          }}
        />
      )}
      {campaignMove === undefined ? null : (
        <ContentUpdateDialog
          character={campaignMove.character}
          target={campaignMove.target}
          onClose={() => setCampaignMove(undefined)}
          onUpdated={() => {
            setCampaignMove(undefined);
            void refresh().catch((reason: unknown) => reportFailure(reason));
          }}
        />
      )}
      {sharing === undefined ? null : (
        <ShareCharacterDialog
          characterId={sharing.id}
          characterName={sharing.title || "character"}
          enabled={characterShare}
          onClose={() => setSharing(undefined)}
        />
      )}
      {receiving ? (
        <ReceiveCharacterDialog
          enabled={characterShare}
          onReceived={(value) =>
            importNativePackage(value, "Receive character")
          }
          onClose={() => setReceiving(false)}
        />
      ) : null}
      {pendingImport === undefined ? null : (
        <CharacterConflictDialog
          title={pendingImport.title}
          text={pendingImport.text}
          count={pendingImport.count}
          onCancel={() => setPendingImport(undefined)}
          onKeepBoth={() => finishPendingImport(false)}
          onReplace={() => finishPendingImport(true)}
        />
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
          onEmpty={() =>
            void repository
              .emptyTrash()
              .then(refresh)
              .catch((reason: unknown) =>
                reportFailure(reason, "Couldn't empty the trash"),
              )
          }
        />
      ) : null}
    </main>
  );
}
